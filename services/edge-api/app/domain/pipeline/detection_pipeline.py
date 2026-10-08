"""Detection pipeline: detections → spatial events → rules → product Events."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.models import Camera, Event, Line, Rule, Zone
from app.domain.counters import CounterStore
from app.domain.metrics import MetricsContext, MetricsEngine, TrackObservation
from app.domain.rules.engine import (
    DetectionContext,
    RuleSnapshot,
    aggregation_from_conditions,
    counter_key_for_rule,
    evaluate_rules,
    infer_trigger,
)
from app.domain.rules.tracker import ZonePresenceTracker
from app.domain.spatial import SpatialEvent
from app.domain.spatial.line_tracker import LineCrossingTracker
from app.domain.spatial.lines import detection_point_normalized
from app.domain.zones.geometry import detection_in_zone

logger = logging.getLogger(__name__)

TOPIC_DETECTIONS = "detections"


def _to_datetime(timestamp: float) -> datetime:
    return datetime.fromtimestamp(float(timestamp), tz=UTC)


class DetectionPipeline:
    """Consumes unified Detection payloads and persists matching Events."""

    def __init__(
        self,
        session_factory: Any,
        tracker: ZonePresenceTracker | None = None,
        line_tracker: LineCrossingTracker | None = None,
        counters: CounterStore | None = None,
        metrics: MetricsEngine | None = None,
        *,
        stale_track_gap_sec: float = 5.0,
    ) -> None:
        self._session_factory = session_factory
        self.tracker = tracker or ZonePresenceTracker()
        self.line_tracker = line_tracker or LineCrossingTracker()
        self.counters = counters or CounterStore()
        self.metrics = metrics or MetricsEngine()
        self.stale_track_gap_sec = stale_track_gap_sec

    async def handle(self, _topic: str, detection: dict[str, Any]) -> list[str]:
        return await self.handle_batch([detection], once_per_track=False)

    async def handle_batch(
        self,
        detections: list[dict[str, Any]],
        *,
        once_per_track: bool = True,
        metrics_scope: str = "production",
        analysis_run_id: str | None = None,
        finalize: bool = False,
    ) -> list[str]:
        """Evaluate a batch of detections for one camera.

        ``metrics_scope`` / ``analysis_run_id`` isolate metric writes (Video Lab passes
        ``video_lab`` + the run id). ``finalize`` closes all open zone presences at the
        end of the batch (end of a video) so dwell sessions and occupancy settle.
        """
        valid = [d for d in detections if d.get("type") == "detection"]
        if not valid:
            return []
        # Spatial enter/exit depends on chronological order; callers may not sort.
        valid.sort(key=lambda d: (float(d.get("timestamp") or 0.0), int(d.get("track_id") or 0)))

        camera_id = str(valid[0]["camera_id"])
        metrics_ctx = MetricsContext(scope=metrics_scope, analysis_run_id=analysis_run_id)
        async with self._session_factory() as session:
            assert isinstance(session, AsyncSession)
            camera = await session.get(Camera, camera_id)
            if camera is None or not camera.enabled:
                return []

            zones_result = await session.execute(select(Zone).where(Zone.camera_id == camera_id))
            zones = list(zones_result.scalars().all())
            enabled_zones = [z for z in zones if z.enabled and z.kind == "polygon"]
            enabled_zone_ids = frozenset(z.id for z in enabled_zones)
            zone_names = {z.id: z.name for z in zones}

            lines_result = await session.execute(select(Line).where(Line.camera_id == camera_id))
            lines = list(lines_result.scalars().all())
            enabled_lines = [ln for ln in lines if ln.enabled]
            line_names = {ln.id: ln.name for ln in lines}

            rules_result = await session.execute(select(Rule))
            rule_rows = list(rules_result.scalars().all())
            last_triggered: dict[str, datetime | None] = {
                r.id: r.last_triggered_at for r in rule_rows
            }
            actions_by_rule = {r.id: list(r.actions_json or []) for r in rule_rows}
            rule_row_by_id = {r.id: r for r in rule_rows}

            # Dwell thresholds per zone from rules (max among dwell/presence rules)
            dwell_by_zone: dict[str, float] = {}
            for r in rule_rows:
                cond = dict(r.conditions_json or {})
                trigger = infer_trigger(cond)
                zid = cond.get("zone_id")
                if not zid:
                    continue
                if trigger == "dwell":
                    dwell_by_zone[zid] = float(cond.get("min_duration_seconds") or 0)
                elif trigger == "zone_presence" and int(cond.get("min_duration_seconds") or 0) > 0:
                    # also emit dwell spatial for presence rules with duration, for diagnostics
                    pass

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
            fired: set[str] = set()
            all_spatial: list[SpatialEvent] = []
            observations: list[TrackObservation] = []
            last_at: datetime | None = None

            for detection in valid:
                if str(detection.get("camera_id")) != camera_id:
                    continue
                object_class = str(detection["class"])
                track_id = detection.get("track_id")
                bbox = detection["bbox"]
                frame_size = detection.get("frame_size") or [1920, 1080]
                confidence = float(detection.get("confidence") or 0)
                at = _to_datetime(detection["timestamp"])
                if track_id is None:
                    continue
                track_id_int = int(track_id)
                last_at = at if last_at is None or at > last_at else last_at
                observations.append(
                    TrackObservation(
                        camera_id=camera_id,
                        track_id=track_id_int,
                        object_class=object_class,
                        timestamp=at,
                    )
                )

                active_zone_ids: set[str] = set()
                zone_durations: dict[str, float] = {}
                spatial: list[SpatialEvent] = []

                for zone in enabled_zones:
                    inside = detection_in_zone(bbox, frame_size, zone.points_json)
                    dwell_thr = dwell_by_zone.get(zone.id)
                    transitions = self.tracker.update(
                        camera_id=camera_id,
                        track_id=track_id_int,
                        zone_id=zone.id,
                        object_class=object_class,
                        inside=inside,
                        at=at,
                        dwell_threshold_sec=dwell_thr,
                    )
                    for tr in transitions:
                        if tr.kind == "zone_presence":
                            active_zone_ids.add(zone.id)
                            zone_durations[zone.id] = tr.duration_seconds
                        spatial.append(
                            SpatialEvent(
                                kind=tr.kind,  # type: ignore[arg-type]
                                camera_id=camera_id,
                                track_id=track_id_int,
                                object_class=object_class,
                                confidence=confidence,
                                timestamp=at,
                                zone_id=tr.zone_id,
                                duration_seconds=tr.duration_seconds,
                                occurrence_id=tr.occurrence_id,
                            )
                        )

                try:
                    point = detection_point_normalized(bbox, frame_size)
                except ValueError:
                    point = None

                if point is not None:
                    for ln in enabled_lines:
                        cross = self.line_tracker.update(
                            camera_id=camera_id,
                            track_id=track_id_int,
                            line_id=ln.id,
                            points=list(ln.points_json or []),
                            point=point,
                            at=at,
                        )
                        if cross is not None:
                            spatial.append(
                                SpatialEvent(
                                    kind="line_cross",
                                    camera_id=camera_id,
                                    track_id=track_id_int,
                                    object_class=object_class,
                                    confidence=confidence,
                                    timestamp=at,
                                    line_id=cross.line_id,
                                    direction=cross.direction,
                                    point=cross.point,
                                    occurrence_id=cross.occurrence_id,
                                )
                            )

                all_spatial.extend(spatial)

                # Update unique counters for count_threshold rules when a relevant spatial event fires
                threshold_fires: dict[str, dict[str, Any]] = {}
                snaps = _snapshots()
                for rule in snaps:
                    if not rule.enabled:
                        continue
                    if infer_trigger(rule.conditions) != "count_threshold":
                        continue
                    # Count on enter or line_cross matching this rule's target
                    relevant = False
                    for ev in spatial:
                        if rule.conditions.get("line_id"):
                            if (
                                ev.kind == "line_cross"
                                and ev.line_id == rule.conditions.get("line_id")
                                and (
                                    not rule.conditions.get("direction")
                                    or rule.conditions.get("direction") == "any"
                                    or rule.conditions.get("direction") == ev.direction
                                )
                            ):
                                relevant = True
                                break
                        elif rule.conditions.get("zone_id"):
                            agg = aggregation_from_conditions(rule.conditions)
                            want_kind = "zone_exit" if agg.get("count_on") == "zone_exit" else "zone_enter"
                            if ev.kind == want_kind and ev.zone_id == rule.conditions.get("zone_id"):
                                relevant = True
                                break
                    if not relevant:
                        continue
                    if rule.conditions.get("object_classes"):
                        if object_class not in rule.conditions["object_classes"]:
                            continue
                    if rule.conditions.get("camera_id") and rule.conditions["camera_id"] != camera_id:
                        continue

                    agg = aggregation_from_conditions(rule.conditions)
                    thr = agg.get("threshold")
                    if thr is None:
                        continue
                    key = counter_key_for_rule(rule, DetectionContext(
                        camera_id=camera_id,
                        object_class=object_class,
                        track_id=track_id_int,
                        confidence=confidence,
                        timestamp=at,
                        active_zone_ids=frozenset(),
                        zone_durations={},
                        camera_enabled=True,
                        enabled_zone_ids=frozenset(),
                    ))
                    _count, fire = self.counters.observe(
                        key=key,
                        track_id=track_id_int,
                        at=at,
                        window_seconds=int(agg["window_seconds"]) if agg.get("window_seconds") else None,
                        operator=str(agg.get("operator") or "gte"),
                        threshold=float(thr),
                    )
                    if fire is not None:
                        threshold_fires[key] = {
                            "count": fire.count,
                            "threshold": fire.threshold,
                            "operator": fire.operator,
                            "window_seconds": fire.window_seconds,
                        }

                ctx = DetectionContext(
                    camera_id=camera_id,
                    object_class=object_class,
                    track_id=track_id_int,
                    confidence=confidence,
                    timestamp=at,
                    active_zone_ids=frozenset(active_zone_ids),
                    zone_durations=zone_durations,
                    camera_enabled=True,
                    enabled_zone_ids=enabled_zone_ids,
                    zone_names=zone_names,
                    line_names=line_names,
                    spatial_events=tuple(spatial),
                    threshold_fires=threshold_fires or None,
                )
                matches = evaluate_rules(snaps, ctx)

                for match in matches:
                    dedupe = match.dedupe_key or f"{match.rule_id}:{track_id_int}"
                    if once_per_track and dedupe in fired:
                        continue
                    if once_per_track:
                        fired.add(dedupe)

                    event_id = f"evt_{uuid.uuid4().hex[:12]}"
                    video_ts = detection.get("video_timestamp_sec")
                    payload: dict[str, Any] = {
                        "detection": detection,
                        "duration_seconds": match.duration_seconds,
                        "rule_name": match.rule_name,
                        "actions": actions_by_rule.get(match.rule_id, []),
                        "spatial_event": match.spatial_event,
                        "track_id": track_id_int,
                    }
                    if video_ts is not None:
                        payload["video_timestamp_sec"] = video_ts
                    if match.zone_id:
                        payload["zone_id"] = match.zone_id
                    if match.line_id:
                        payload["line_id"] = match.line_id
                    if match.direction:
                        payload["direction"] = match.direction
                    if match.count is not None:
                        payload["count"] = match.count
                        payload["threshold"] = match.threshold
                        payload["window_seconds"] = match.window_seconds
                        payload["operator"] = match.operator

                    event = Event(
                        id=event_id,
                        camera_id=camera_id,
                        rule_id=match.rule_id,
                        type=match.event_type,
                        severity=match.severity,
                        object_class=object_class,
                        track_id=track_id_int,
                        zone_id=match.zone_id,
                        confidence=confidence,
                        started_at=at,
                        ended_at=None,
                        state="new",
                        message_he=match.message_he,
                        payload_json=payload,
                        # Run ownership is fixed at create time (not during Event Media).
                        source_analysis_run_id=analysis_run_id,
                    )
                    session.add(event)
                    rule_row = rule_row_by_id.get(match.rule_id)
                    if rule_row is not None:
                        rule_row.last_triggered_at = at
                    last_triggered[match.rule_id] = at
                    created_ids.append(event_id)

            # Close stale / finished presences so dwell sessions + occupancy settle (metrics only)
            if last_at is not None:
                closed = (
                    self.tracker.flush_camera(camera_id, now=last_at)
                    if finalize
                    else self.tracker.expire_stale(
                        camera_id=camera_id, now=last_at, max_gap_sec=self.stale_track_gap_sec
                    )
                )
                for tid, cls, tr in closed:
                    all_spatial.append(
                        SpatialEvent(
                            kind="zone_exit",
                            camera_id=camera_id,
                            track_id=int(tid),
                            object_class=cls,
                            confidence=0.0,
                            timestamp=tr.entered_at + timedelta(seconds=tr.duration_seconds),
                            zone_id=tr.zone_id,
                            duration_seconds=tr.duration_seconds,
                            occurrence_id=tr.occurrence_id,
                        )
                    )
                if finalize:
                    self.line_tracker.clear_camera(camera_id)

            try:
                await self.metrics.ingest(
                    session,
                    spatial_events=all_spatial,
                    observations=observations,
                    ctx=metrics_ctx,
                )
            except Exception:  # metrics must never break event creation
                logger.exception("metrics_ingest_failed camera=%s scope=%s", camera_id, metrics_scope)

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
