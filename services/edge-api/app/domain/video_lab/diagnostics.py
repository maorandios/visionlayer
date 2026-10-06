"""Post-analysis rule diagnostics for Video Lab clarity."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.domain.rules.engine import infer_trigger
from app.domain.rules.schedule import is_within_schedule
from app.domain.rules.tracker import ZonePresenceTracker
from app.domain.spatial.line_tracker import LineCrossingTracker
from app.domain.spatial.lines import detection_point_normalized, direction_matches
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
                "spatial_event": payload.get("spatial_event"),
                "line_id": payload.get("line_id"),
                "direction": payload.get("direction"),
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
    lines: list[Any] | None = None,
) -> list[dict[str, Any]]:
    """Explain per-rule whether it matched and why not, in Hebrew."""
    zone_by_id = {z.id: z for z in zones}
    enabled_zone_ids = {z.id for z in zones if z.enabled and z.kind == "polygon"}
    line_by_id = {ln.id: ln for ln in (lines or [])}

    checks: list[dict[str, Any]] = []
    for rule in rules:
        conditions = dict(rule.conditions_json or {})
        rule_camera = conditions.get("camera_id")
        if rule_camera and rule_camera != camera_id:
            continue

        trigger = infer_trigger(conditions)
        object_classes = list(conditions.get("object_classes") or [])
        zone_id = conditions.get("zone_id")
        line_id = conditions.get("line_id")
        min_duration = int(conditions.get("min_duration_seconds") or 0)
        schedule = conditions.get("schedule")
        zone = zone_by_id.get(zone_id) if zone_id else None
        line = line_by_id.get(line_id) if line_id else None

        class_counts = {
            cls: sum(1 for d in detections if d.get("class") == cls) for cls in object_classes
        }
        detected_count = sum(class_counts.values())
        target_dets = [d for d in detections if d.get("class") in object_classes]

        status = "ok"
        reason_he = "החוק הופעל"
        max_duration = 0.0
        in_zone_count = 0
        enter_count = 0
        exit_count = 0
        cross_count = 0
        first_in_zone_sec: float | None = None

        if not rule.enabled:
            status = "disabled"
            reason_he = "החוק כבוי"
        elif not object_classes:
            status = "misconfigured"
            reason_he = "לא הוגדר סוג אובייקט בחוק"
        elif trigger in {"zone_presence", "zone_enter", "zone_exit", "dwell"} and not zone_id:
            status = "misconfigured"
            reason_he = "לא הוגדר אזור בחוק"
        elif trigger == "line_cross" and not line_id:
            status = "misconfigured"
            reason_he = "לא הוגדר קו בחוק"
        elif zone_id and zone is None and trigger != "line_cross" and trigger != "count_threshold":
            status = "misconfigured"
            reason_he = "האזור שבחוק לא נמצא במצלמה זו"
        elif zone_id and zone_id not in enabled_zone_ids and trigger.startswith("zone"):
            status = "zone_disabled"
            reason_he = "האזור כבוי"
        elif trigger == "line_cross" and line is None:
            status = "misconfigured"
            reason_he = "הקו שבחוק לא נמצא במצלמה זו"
        elif detected_count == 0:
            status = "object_not_detected"
            wanted = ", ".join(class_he(c) for c in object_classes)
            reason_he = f"בסרטון לא זוהה האובייקט שביקשת: {wanted}"
        elif trigger == "line_cross" and line is not None:
            lt = LineCrossingTracker()
            required_dir = conditions.get("direction") or "any"
            for det in target_dets:
                tid = det.get("track_id")
                if tid is None:
                    continue
                try:
                    pt = detection_point_normalized(
                        det.get("bbox") or [], det.get("frame_size") or [1, 1]
                    )
                except ValueError:
                    continue
                cross = lt.update(
                    camera_id=camera_id,
                    track_id=int(tid),
                    line_id=line.id,
                    points=list(line.points_json or []),
                    point=pt,
                    at=_to_dt(float(det["timestamp"])),
                )
                if cross and direction_matches(cross.direction, required_dir):
                    cross_count += 1
            if cross_count == 0:
                status = "object_not_in_zone"
                reason_he = f"לא זוהתה חציית קו «{line.name}»"
            elif rule.id in triggered_rule_ids:
                status = "triggered"
                reason_he = "החוק הופעל — נוצר אירוע"
            else:
                status = "no_event"
                reason_he = "זוהתה חצייה אך לא נוצר אירוע (בדקו כיוון/cooldown)"
        elif zone is not None:
            tracker = ZonePresenceTracker()
            dwell_thr = float(min_duration) if trigger == "dwell" else None
            for det in target_dets:
                bbox = det.get("bbox") or []
                frame_size = det.get("frame_size") or [1, 1]
                inside = detection_in_zone(bbox, frame_size, zone.points_json)
                at = _to_dt(float(det["timestamp"]))
                track_id = int(det["track_id"]) if det.get("track_id") is not None else None
                if track_id is None:
                    continue
                transitions = tracker.update(
                    camera_id=camera_id,
                    track_id=track_id,
                    zone_id=zone_id,
                    object_class=str(det["class"]),
                    inside=inside,
                    at=at,
                    dwell_threshold_sec=dwell_thr,
                )
                for tr in transitions:
                    if tr.kind == "zone_enter":
                        enter_count += 1
                    elif tr.kind == "zone_exit":
                        exit_count += 1
                    elif tr.kind == "zone_presence":
                        in_zone_count += 1
                        video_sec = float(det["timestamp"]) - base_unix_ts
                        if first_in_zone_sec is None:
                            first_in_zone_sec = video_sec
                        max_duration = max(max_duration, float(tr.duration_seconds))

            if trigger == "zone_enter":
                if enter_count == 0:
                    status = "object_not_in_zone"
                    reason_he = f"לא זוהה כניסה לאזור «{zone.name}»"
                elif rule.id in triggered_rule_ids:
                    status = "triggered"
                    reason_he = "החוק הופעל — נוצר אירוע"
                else:
                    status = "no_event"
                    reason_he = "זוהתה כניסה אך לא נוצר אירוע"
            elif trigger == "zone_exit":
                if exit_count == 0:
                    status = "object_not_in_zone"
                    reason_he = f"לא זוהתה יציאה מאזור «{zone.name}»"
                elif rule.id in triggered_rule_ids:
                    status = "triggered"
                    reason_he = "החוק הופעל — נוצר אירוע"
                else:
                    status = "no_event"
                    reason_he = "זוהתה יציאה אך לא נוצר אירוע"
            elif in_zone_count == 0:
                status = "object_not_in_zone"
                wanted = ", ".join(class_he(c) for c in object_classes)
                reason_he = f"{wanted} זוהה בסרטון, אבל לא נכנס לאזור «{zone.name}»"
            elif max_duration < min_duration:
                status = "duration_too_short"
                reason_he = (
                    f"האובייקט היה באזור עד {max_duration:.1f} שניות, "
                    f"אבל החוק דורש לפחות {min_duration} שניות"
                )
            else:
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
        elif trigger == "count_threshold":
            if rule.id in triggered_rule_ids:
                status = "triggered"
                reason_he = "סף הספירה הושג — נוצר אירוע"
            else:
                status = "no_event"
                reason_he = "סף הספירה לא הושג בסרטון"
        else:
            status = "misconfigured"
            reason_he = "תצורת חוק לא נתמכת"

        checks.append(
            {
                "rule_id": rule.id,
                "rule_name": rule.name,
                "enabled": bool(rule.enabled),
                "trigger": trigger,
                "object_classes": object_classes,
                "object_classes_he": [class_he(c) for c in object_classes],
                "zone_id": zone_id,
                "zone_name": zone.name if zone else None,
                "line_id": line_id,
                "line_name": line.name if line else None,
                "min_duration_seconds": min_duration,
                "detected_count": detected_count,
                "in_zone_count": in_zone_count,
                "enter_count": enter_count,
                "exit_count": exit_count,
                "cross_count": cross_count,
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
    """Compact timeline for Video Lab focus UI."""
    items: list[dict[str, Any]] = []
    for cls, info in sorted(first_seen.items(), key=lambda kv: float(kv[1].get("timestamp_sec") or 0)):
        items.append(
            {
                "kind": "first_seen",
                "timestamp_sec": info.get("timestamp_sec"),
                "label": f"זוהה {info.get('class_he') or cls}",
                "class": cls,
            }
        )
    for hit in hits:
        items.append(
            {
                "kind": "event",
                "timestamp_sec": hit.get("timestamp_sec"),
                "label": hit.get("message_he") or hit.get("rule_name"),
                "event_id": hit.get("event_id"),
                "rule_id": hit.get("rule_id"),
            }
        )
    for check in rule_checks:
        if check.get("status") == "triggered":
            continue
        if check.get("status") in {"disabled", "misconfigured"}:
            items.append(
                {
                    "kind": "rule_issue",
                    "timestamp_sec": check.get("first_in_zone_sec"),
                    "label": f"{check.get('rule_name')}: {check.get('reason_he')}",
                    "rule_id": check.get("rule_id"),
                    "status": check.get("status"),
                }
            )
    items.sort(key=lambda x: float(x.get("timestamp_sec") or 0))
    return items
