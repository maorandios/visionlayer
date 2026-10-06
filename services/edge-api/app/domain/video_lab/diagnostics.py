"""Post-analysis rule diagnostics for Video Lab clarity."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.domain.rules.schedule import is_within_schedule
from app.domain.rules.tracker import ZonePresenceTracker
from app.domain.zones.geometry import detection_in_zone

_CLASS_HE = {
    "person": "אדם",
    "car": "רכב",
    "truck": "משאית",
    "bus": "אוטובוס",
    "bicycle": "אופניים",
    "motorcycle": "אופנוע",
    "dog": "כלב",
    "cat": "חתול",
}


def class_he(name: str) -> str:
    return _CLASS_HE.get(name, name)


def _to_dt(ts: float) -> datetime:
    return datetime.fromtimestamp(float(ts), tz=UTC)


def first_seen_by_class(
    detections: list[dict[str, Any]],
    *,
    base_unix_ts: float,
) -> dict[str, dict[str, Any]]:
    """Earliest video-relative sighting per class."""
    out: dict[str, dict[str, Any]] = {}
    for det in detections:
        cls = str(det.get("class") or "")
        if not cls or cls in out:
            continue
        abs_ts = float(det["timestamp"])
        out[cls] = {
            "class": cls,
            "class_he": class_he(cls),
            "timestamp_sec": round(abs_ts - base_unix_ts, 3),
            "track_id": int(det["track_id"]) if det.get("track_id") is not None else None,
            "confidence": float(det.get("confidence") or 0),
            "bbox": list(det.get("bbox") or []),
        }
    return out


def build_hits_from_events(
    events: list[Any],
    *,
    base_unix_ts: float,
) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for row in events:
        started = row.started_at
        if started is None:
            continue
        if started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        video_ts = max(0.0, started.timestamp() - base_unix_ts)
        payload = dict(row.payload_json or {})
        hits.append(
            {
                "event_id": row.id,
                "rule_id": row.rule_id,
                "rule_name": payload.get("rule_name") or row.rule_id,
                "object_class": row.object_class,
                "object_class_he": class_he(str(row.object_class or "")),
                "zone_id": row.zone_id,
                "track_id": row.track_id,
                "timestamp_sec": round(video_ts, 3),
                "message_he": row.message_he,
                "confidence": row.confidence,
            }
        )
    hits.sort(key=lambda h: h["timestamp_sec"])
    return hits


def diagnose_rules(
    *,
    camera_id: str,
    rules: list[Any],
    zones: list[Any],
    detections: list[dict[str, Any]],
    base_unix_ts: float,
    triggered_rule_ids: set[str],
) -> list[dict[str, Any]]:
    """Explain per-rule whether it matched and why not, in Hebrew."""
    zone_by_id = {z.id: z for z in zones}
    enabled_zone_ids = {z.id for z in zones if z.enabled and z.kind == "polygon"}

    checks: list[dict[str, Any]] = []
    for rule in rules:
        conditions = dict(rule.conditions_json or {})
        rule_camera = conditions.get("camera_id")
        if rule_camera and rule_camera != camera_id:
            continue

        object_classes = list(conditions.get("object_classes") or [])
        zone_id = conditions.get("zone_id")
        min_duration = int(conditions.get("min_duration_seconds") or 0)
        schedule = conditions.get("schedule")
        zone = zone_by_id.get(zone_id) if zone_id else None

        class_counts = {
            cls: sum(1 for d in detections if d.get("class") == cls) for cls in object_classes
        }
        detected_count = sum(class_counts.values())
        target_dets = [d for d in detections if d.get("class") in object_classes]

        status = "ok"
        reason_he = "החוק הופעל"
        max_duration = 0.0
        in_zone_count = 0
        first_in_zone_sec: float | None = None

        if not rule.enabled:
            status = "disabled"
            reason_he = "החוק כבוי"
        elif not object_classes:
            status = "misconfigured"
            reason_he = "לא הוגדר סוג אובייקט בחוק"
        elif not zone_id:
            status = "misconfigured"
            reason_he = "לא הוגדר אזור בחוק"
        elif zone is None:
            status = "misconfigured"
            reason_he = "האזור שבחוק לא נמצא במצלמה זו"
        elif zone_id not in enabled_zone_ids:
            status = "zone_disabled"
            reason_he = "האזור כבוי"
        elif detected_count == 0:
            status = "object_not_detected"
            wanted = ", ".join(class_he(c) for c in object_classes)
            reason_he = f"בסרטון לא זוהה האובייקט שביקשת: {wanted}"
        else:
            tracker = ZonePresenceTracker()
            for det in target_dets:
                bbox = det.get("bbox") or []
                frame_size = det.get("frame_size") or [1, 1]
                inside = detection_in_zone(bbox, frame_size, zone.points_json)
                at = _to_dt(float(det["timestamp"]))
                track_id = int(det["track_id"]) if det.get("track_id") is not None else None
                if track_id is None:
                    continue
                state = tracker.update(
                    camera_id=camera_id,
                    track_id=track_id,
                    zone_id=zone_id,
                    object_class=str(det["class"]),
                    inside=inside,
                    at=at,
                )
                if state is not None and inside:
                    in_zone_count += 1
                    video_sec = float(det["timestamp"]) - base_unix_ts
                    if first_in_zone_sec is None:
                        first_in_zone_sec = video_sec
                    dur = tracker.duration_seconds(
                        camera_id=camera_id,
                        track_id=track_id,
                        zone_id=zone_id,
                        at=at,
                    )
                    if dur is not None:
                        max_duration = max(max_duration, float(dur))

            if in_zone_count == 0:
                status = "object_not_in_zone"
                wanted = ", ".join(class_he(c) for c in object_classes)
                zone_name = zone.name if zone else zone_id
                reason_he = f"{wanted} זוהה בסרטון, אבל לא נכנס לאזור «{zone_name}»"
            elif max_duration < min_duration:
                status = "duration_too_short"
                reason_he = (
                    f"האובייקט היה באזור עד {max_duration:.1f} שניות, "
                    f"אבל החוק דורש לפחות {min_duration} שניות"
                )
            else:
                # Schedule check on first in-zone detection time
                sample_ts = _to_dt(base_unix_ts + (first_in_zone_sec or 0.0))
                if not is_within_schedule(sample_ts, schedule):
                    status = "outside_schedule"
                    reason_he = "זמן הווידאו מחוץ לחלון השעות של החוק"
                elif rule.id in triggered_rule_ids:
                    status = "triggered"
                    reason_he = "החוק הופעל — נוצר אירוע"
                else:
                    status = "no_event"
                    reason_he = "התנאים התקיימו לפי הבדיקה, אך לא נוצר אירוע (בדקו cooldown/פעולות)"

        checks.append(
            {
                "rule_id": rule.id,
                "rule_name": rule.name,
                "enabled": bool(rule.enabled),
                "object_classes": object_classes,
                "object_classes_he": [class_he(c) for c in object_classes],
                "zone_id": zone_id,
                "zone_name": zone.name if zone else None,
                "min_duration_seconds": min_duration,
                "detected_count": detected_count,
                "in_zone_count": in_zone_count,
                "max_duration_sec": round(max_duration, 2),
                "first_in_zone_sec": round(first_in_zone_sec, 3) if first_in_zone_sec is not None else None,
                "triggered": rule.id in triggered_rule_ids,
                "status": status,
                "reason_he": reason_he,
            }
        )

    return checks


def build_focus_timeline(
    *,
    first_seen: dict[str, dict[str, Any]],
    hits: list[dict[str, Any]],
    rule_checks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Compact timeline: first sighting per class + rule hits (not every person box)."""
    items: list[dict[str, Any]] = []
    for cls, info in sorted(first_seen.items(), key=lambda kv: kv[1]["timestamp_sec"]):
        items.append(
            {
                "timestamp_sec": info["timestamp_sec"],
                "kind": "first_seen",
                "label": f"זיהוי ראשון: {info['class_he']} #{info.get('track_id')}",
                "class": cls,
            }
        )
    for check in rule_checks:
        if check.get("first_in_zone_sec") is not None and check.get("status") in {
            "triggered",
            "duration_too_short",
            "object_not_in_zone",
        }:
            items.append(
                {
                    "timestamp_sec": check["first_in_zone_sec"],
                    "kind": "rule_zone",
                    "label": f"באזור לפי חוק «{check['rule_name']}»",
                    "class": (check.get("object_classes") or [None])[0],
                    "rule_id": check["rule_id"],
                }
            )
    for hit in hits:
        items.append(
            {
                "timestamp_sec": hit["timestamp_sec"],
                "kind": "event",
                "label": f"אירוע: {hit.get('rule_name')} ({hit.get('object_class_he')})",
                "class": hit.get("object_class"),
                "event_id": hit.get("event_id"),
                "rule_id": hit.get("rule_id"),
            }
        )
    items.sort(key=lambda x: (x["timestamp_sec"], x["kind"]))
    # de-dupe near-identical labels at same second
    seen: set[tuple[float, str]] = set()
    unique: list[dict[str, Any]] = []
    for item in items:
        key = (round(float(item["timestamp_sec"]), 2), str(item["label"]))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique
