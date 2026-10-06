"""Detection pipeline: unified detections → zones → rules → events."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.models import Camera, Event, Rule, Zone
from app.domain.rules.engine import DetectionContext, RuleSnapshot, evaluate_rules
from app.domain.rules.tracker import ZonePresenceTracker
from app.domain.zones.geometry import detection_in_zone

logger = logging.getLogger(__name__)

TOPIC_DETECTIONS = "detections"


def _to_datetime(timestamp: float) -> datetime:
    return datetime.fromtimestamp(float(timestamp), tz=UTC)


class DetectionPipeline:
    """Consumes unified Detection payloads and persists matching Events."""

    def __init__(self, session_factory: Any, tracker: ZonePresenceTracker | None = None) -> None:
        self._session_factory = session_factory
        self.tracker = tracker or ZonePresenceTracker()

    async def handle(self, _topic: str, detection: dict[str, Any]) -> list[str]:
        """Process one detection. Returns created event ids."""
        return await self.handle_batch([detection], once_per_track=False)

    async def handle_batch(
        self,
        detections: list[dict[str, Any]],
        *,
        once_per_track: bool = True,
    ) -> list[str]:
        """Process many detections in one DB session (Video Lab fast path).

        once_per_track: emit at most one event per (rule_id, track_id) —
        avoids flooding when cooldown=0 on long tracks.
        """
        valid = [d for d in detections if d.get("type") == "detection"]
        if not valid:
            return []

        camera_id = str(valid[0]["camera_id"])
        async with self._session_factory() as session:
            assert isinstance(session, AsyncSession)
            camera = await session.get(Camera, camera_id)
            if camera is None or not camera.enabled:
                return []

            zones_result = await session.execute(select(Zone).where(Zone.camera_id == camera_id))
            zones = list(zones_result.scalars().all())
            enabled_zones = [z for z in zones if z.enabled and z.kind == "polygon"]
            enabled_zone_ids = frozenset(z.id for z in enabled_zones)

            rules_result = await session.execute(select(Rule))
            rule_rows = list(rules_result.scalars().all())
            last_triggered: dict[str, datetime | None] = {
                r.id: r.last_triggered_at for r in rule_rows
            }
            actions_by_rule = {r.id: list(r.actions_json or []) for r in rule_rows}

            def _snapshots() -> list[RuleSnapshot]:
                return [
                    RuleSnapshot(
                        id=r.id,
                        name=r.name,
                        enabled=r.enabled,
                        conditions=dict(r.conditions_json or {}),
                        actions=actions_by_rule[r.id],
                        cooldown_seconds=int(r.cooldown_seconds or 0),
                        last_triggered_at=last_triggered.get(r.id),
                    )
                    for r in rule_rows
                ]

            created_ids: list[str] = []
            fired: set[tuple[str, int]] = set()
            rule_row_by_id = {r.id: r for r in rule_rows}

            for detection in valid:
                if str(detection.get("camera_id")) != camera_id:
                    continue
                object_class = str(detection["class"])
                track_id = detection.get("track_id")
                bbox = detection["bbox"]
                frame_size = detection.get("frame_size") or [1920, 1080]
                confidence = float(detection.get("confidence") or 0)
                at = _to_datetime(detection["timestamp"])

                active_zone_ids: set[str] = set()
                zone_durations: dict[str, float] = {}

                if track_id is not None:
                    track_id_int = int(track_id)
                    for zone in enabled_zones:
                        inside = detection_in_zone(bbox, frame_size, zone.points_json)
                        state = self.tracker.update(
                            camera_id=camera_id,
                            track_id=track_id_int,
                            zone_id=zone.id,
                            object_class=object_class,
                            inside=inside,
                            at=at,
                        )
                        if state is not None:
                            active_zone_ids.add(zone.id)
                            duration = self.tracker.duration_seconds(
                                camera_id=camera_id,
                                track_id=track_id_int,
                                zone_id=zone.id,
                                at=at,
                            )
                            if duration is not None:
                                zone_durations[zone.id] = duration

                ctx = DetectionContext(
                    camera_id=camera_id,
                    object_class=object_class,
                    track_id=int(track_id) if track_id is not None else None,
                    confidence=confidence,
                    timestamp=at,
                    active_zone_ids=frozenset(active_zone_ids),
                    zone_durations=zone_durations,
                    camera_enabled=True,
                    enabled_zone_ids=enabled_zone_ids,
                )
                matches = evaluate_rules(_snapshots(), ctx)

                for match in matches:
                    tid_key = int(track_id) if track_id is not None else -1
                    fire_key = (match.rule_id, tid_key)
                    if once_per_track and fire_key in fired:
                        continue
                    if once_per_track:
                        fired.add(fire_key)

                    event_id = f"evt_{uuid.uuid4().hex[:12]}"
                    event = Event(
                        id=event_id,
                        camera_id=camera_id,
                        rule_id=match.rule_id,
                        type=match.event_type,
                        severity=match.severity,
                        object_class=object_class,
                        track_id=int(track_id) if track_id is not None else None,
                        zone_id=match.zone_id,
                        confidence=confidence,
                        started_at=at,
                        ended_at=None,
                        state="new",
                        message_he=match.message_he,
                        payload_json={
                            "detection": detection,
                            "duration_seconds": match.duration_seconds,
                            "rule_name": match.rule_name,
                            "actions": actions_by_rule.get(match.rule_id, []),
                        },
                    )
                    session.add(event)
                    rule_row = rule_row_by_id.get(match.rule_id)
                    if rule_row is not None:
                        rule_row.last_triggered_at = at
                    last_triggered[match.rule_id] = at
                    created_ids.append(event_id)

            await session.commit()
            if created_ids:
                logger.info(
                    "batch_events_created camera=%s detections=%s events=%s once_per_track=%s",
                    camera_id,
                    len(valid),
                    len(created_ids),
                    once_per_track,
                )
            return created_ids
