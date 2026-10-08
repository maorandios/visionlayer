"""Build per-run AI Test debug payload from the same detections/events as product output.

Does not re-run detection — only derives explainability traces from the analysis result.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from app.domain.spatial.line_tracker import LineCrossingTracker
from app.domain.spatial.lines import detection_point_normalized, direction_matches
from app.domain.rules.schedule import is_within_schedule
from app.domain.rules.tracker import ZonePresenceTracker
from app.domain.video_lab.diagnostics import class_he, diagnose_rules
from app.domain.video_lab.execution_plans import (
    VISIONLAYER_PRIMARY_CLASSES,
    compile_camera_execution_plans,
    vehicle_group_resolution,
)
from app.domain.zones.geometry import bbox_bottom_center

# Normalized rejection reasons (developer-facing codes → Hebrew)
REJECTION_REASON_HE: dict[str, str] = {
    "object_class_mismatch": "סוג האובייקט לא תואם לחוק",
    "track_not_confirmed": "המסלול לא אושר עדיין",
    "zone_not_entered": "המסלול לא נכנס לאזור",
    "zone_not_exited": "המסלול לא יצא מהאזור",
    "not_inside_zone": "העוגן המרחבי אינו בתוך האזור",
    "dwell_not_reached": "משך השהייה לא הגיע לסף",
    "line_not_crossed": "המסלול לא חצה את הקו",
    "direction_mismatch": "כיוון החצייה לא תואם",
    "threshold_not_reached": "סף הכמות לא הושג",
    "schedule_mismatch": "מחוץ לחלון השעות של החוק",
    "dedupe_blocked": "כבר הופעל עבור מסלול זה",
    "cooldown_active": "cooldown פעיל — אירוע נחסם",
    "rule_disabled": "החוק כבוי",
    "misconfigured": "תצורת חוק לא תקינה",
    "no_detections": "לא זוהו אובייקטים מתאימים",
    "line_unavailable": "הקו לא זמין במצלמה",
    "zone_unavailable": "האזור לא זמין במצלמה",
}

STATUS_TO_REJECTION: dict[str, str] = {
    "disabled": "rule_disabled",
    "misconfigured": "misconfigured",
    "zone_disabled": "zone_unavailable",
    "object_not_detected": "no_detections",
    "object_not_in_zone": "not_inside_zone",
    "duration_too_short": "dwell_not_reached",
    "outside_schedule": "schedule_mismatch",
    "no_event": "dedupe_blocked",
}


def rejection_he(code: str | None) -> str | None:
    if not code:
        return None
    return REJECTION_REASON_HE.get(code, code)


def _to_dt(ts: float) -> datetime:
    return datetime.fromtimestamp(float(ts), tz=UTC)


def _anchor_px(bbox: list[float]) -> list[float]:
    """Bottom-center of bbox in pixel space (same point used for zone/line tests)."""
    if len(bbox) < 4:
        return [0.0, 0.0]
    cx, cy = bbox_bottom_center(bbox)
    return [round(float(cx), 2), round(float(cy), 2)]


def build_track_debug(
    detections: list[dict[str, Any]],
    *,
    base_unix_ts: float,
    zones: list[Any],
    lines: list[Any],
    camera_id: str,
) -> list[dict[str, Any]]:
    by_track: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for det in detections:
        tid = det.get("track_id")
        if tid is None:
            continue
        by_track[int(tid)].append(det)

    zone_by_id = {z.id: z for z in zones if getattr(z, "enabled", True)}
    line_list = [ln for ln in lines if getattr(ln, "enabled", True)]
    tracks: list[dict[str, Any]] = []

    for tid, obs in sorted(by_track.items()):
        obs_sorted = sorted(obs, key=lambda d: float(d.get("timestamp") or 0))
        confs = [float(d.get("confidence") or 0) for d in obs_sorted]
        cls = str(obs_sorted[0].get("class") or "")
        first_ts = float(obs_sorted[0]["timestamp"])
        last_ts = float(obs_sorted[-1]["timestamp"])
        observations: list[dict[str, Any]] = []
        zone_history: list[dict[str, Any]] = []
        line_side_history: list[dict[str, Any]] = []
        crossings: list[dict[str, Any]] = []

        zt = ZonePresenceTracker()
        lt = LineCrossingTracker()
        prev_zone_state: dict[str, bool] = {}

        for det in obs_sorted:
            bbox = list(det.get("bbox") or [])
            frame_size = det.get("frame_size") or [1, 1]
            ts = float(det["timestamp"])
            video_sec = ts - base_unix_ts
            anchor = _anchor_px(bbox)
            try:
                pt = detection_point_normalized(bbox, frame_size)
            except ValueError:
                pt = None

            inside_map: dict[str, bool] = {}
            for zid, zone in zone_by_id.items():
                try:
                    from app.domain.zones.geometry import detection_in_zone

                    inside = detection_in_zone(bbox, frame_size, zone.points_json)
                except Exception:
                    inside = False
                inside_map[zid] = inside
                if prev_zone_state.get(zid) != inside:
                    zone_history.append(
                        {
                            "zone_id": zid,
                            "zone_name": getattr(zone, "name", zid),
                            "state": "inside" if inside else "outside",
                            "video_sec": round(video_sec, 3),
                        }
                    )
                    prev_zone_state[zid] = inside
                zt.update(
                    camera_id=camera_id,
                    track_id=tid,
                    zone_id=zid,
                    object_class=cls,
                    inside=inside,
                    at=_to_dt(ts),
                )

            if pt is not None:
                for ln in line_list:
                    cross = lt.update(
                        camera_id=camera_id,
                        track_id=tid,
                        line_id=ln.id,
                        points=list(ln.points_json or []),
                        point=pt,
                        at=_to_dt(ts),
                    )
                    line_side_history.append(
                        {
                            "line_id": ln.id,
                            "line_name": getattr(ln, "name", ln.id),
                            "video_sec": round(video_sec, 3),
                            "anchor_norm": [round(pt[0], 4), round(pt[1], 4)],
                        }
                    )
                    if cross:
                        crossings.append(
                            {
                                "line_id": ln.id,
                                "line_name": getattr(ln, "name", ln.id),
                                "direction": cross.direction,
                                "video_sec": round(video_sec, 3),
                            }
                        )

            observations.append(
                {
                    "video_sec": round(video_sec, 3),
                    "frame_index": det.get("frame_index"),
                    "confidence": round(float(det.get("confidence") or 0), 4),
                    "bbox": [round(float(x), 2) for x in bbox] if bbox else [],
                    "anchor_px": anchor,
                    "zones_inside": [zid for zid, inn in inside_map.items() if inn],
                }
            )

        # Subsample observations for payload size (keep ends + every Nth)
        max_obs = 80
        if len(observations) > max_obs:
            step = max(1, len(observations) // max_obs)
            slim = observations[::step]
            if slim[-1] is not observations[-1]:
                slim.append(observations[-1])
            observations = slim

        tracks.append(
            {
                "track_id": tid,
                "class": cls,
                "class_he": class_he(cls),
                "first_seen_sec": round(first_ts - base_unix_ts, 3),
                "last_seen_sec": round(last_ts - base_unix_ts, 3),
                "observation_count": len(obs_sorted),
                "confidence_avg": round(sum(confs) / max(1, len(confs)), 4),
                "confidence_min": round(min(confs), 4) if confs else None,
                "confidence_max": round(max(confs), 4) if confs else None,
                "confirmed": True,  # ByteTrack output = confirmed tracks in this pipeline
                "observations": observations,
                "zone_history": zone_history[-40:],
                "line_side_history": line_side_history[-40:],
                "crossings": crossings,
            }
        )
    return tracks


def build_per_class_summary(detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_cls: dict[str, list[dict[str, Any]]] = defaultdict(list)
    tracks: dict[str, set[int]] = defaultdict(set)
    for det in detections:
        cls = str(det.get("class") or "")
        if not cls:
            continue
        by_cls[cls].append(det)
        tid = det.get("track_id")
        if tid is not None:
            tracks[cls].add(int(tid))
    rows = []
    for cls in VISIONLAYER_PRIMARY_CLASSES:
        dets = by_cls.get(cls, [])
        confs = [float(d.get("confidence") or 0) for d in dets]
        rows.append(
            {
                "class": cls,
                "class_he": class_he(cls),
                "detections": len(dets),
                "tracks": len(tracks.get(cls, set())),
                "confidence_avg": round(sum(confs) / len(confs), 4) if confs else None,
                "confidence_min": round(min(confs), 4) if confs else None,
                "confidence_max": round(max(confs), 4) if confs else None,
            }
        )
    return rows


def build_rule_candidate_traces(
    *,
    camera_id: str,
    rules: list[Any],
    zones: list[Any],
    lines: list[Any],
    detections: list[dict[str, Any]],
    base_unix_ts: float,
    triggered_rule_ids: set[str],
    event_rows: list[Any],
    schedule_eval_ts: datetime | None,
    schedule_warning: str | None,
) -> list[dict[str, Any]]:
    """Per-rule candidate track evaluations with match/reject reasons."""
    zone_by_id = {z.id: z for z in zones}
    line_by_id = {ln.id: ln for ln in lines}
    events_by_rule: dict[str, list[Any]] = defaultdict(list)
    for ev in event_rows:
        rid = getattr(ev, "rule_id", None) or (ev.payload_json or {}).get("rule_id")
        if rid:
            events_by_rule[str(rid)].append(ev)

    # Precompute tracks
    by_track: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for det in detections:
        tid = det.get("track_id")
        if tid is not None:
            by_track[int(tid)].append(det)

    out: list[dict[str, Any]] = []
    for rule in rules:
        conditions = dict(rule.conditions_json or {})
        rule_camera = conditions.get("camera_id")
        if rule_camera and rule_camera != camera_id:
            continue
        from app.domain.rules.engine import infer_trigger

        trigger = infer_trigger(conditions)
        object_classes = set(conditions.get("object_classes") or [])
        zone_id = conditions.get("zone_id")
        line_id = conditions.get("line_id")
        required_dir = conditions.get("direction") or "any"
        min_duration = float(conditions.get("min_duration_seconds") or 0)
        schedule = conditions.get("schedule")
        zone = zone_by_id.get(zone_id) if zone_id else None
        line = line_by_id.get(line_id) if line_id else None

        candidates: list[dict[str, Any]] = []
        rejection_counts: dict[str, int] = defaultdict(int)
        matched = 0
        rejected = 0

        # Schedule check once for the run evaluation timestamp
        schedule_ok = True
        eval_ts_iso = None
        if schedule:
            ts = schedule_eval_ts or (
                _to_dt(base_unix_ts) if detections else datetime.now(UTC)
            )
            eval_ts_iso = ts.isoformat()
            schedule_ok = is_within_schedule(ts, schedule)

        fired_tracks = set()
        for ev in events_by_rule.get(rule.id, []):
            payload = dict(ev.payload_json or {})
            tid = payload.get("track_id")
            if tid is not None:
                fired_tracks.add(int(tid))

        for tid, obs in by_track.items():
            cls = str(obs[0].get("class") or "")
            checks: list[dict[str, Any]] = []
            reason: str | None = None

            class_ok = not object_classes or cls in object_classes
            checks.append({"key": "object_class_matched", "ok": class_ok})
            if not class_ok:
                reason = "object_class_mismatch"
                rejected += 1
                rejection_counts[reason] += 1
                candidates.append(
                    {
                        "track_id": tid,
                        "class": cls,
                        "checks": checks,
                        "matched": False,
                        "rejection_reason": reason,
                        "rejection_he": rejection_he(reason),
                    }
                )
                continue

            checks.append({"key": "track_confirmed", "ok": True})

            if schedule:
                checks.append(
                    {
                        "key": "schedule_matched",
                        "ok": schedule_ok,
                        "eval_timestamp": eval_ts_iso,
                    }
                )
                if not schedule_ok:
                    reason = "schedule_mismatch"
                    rejected += 1
                    rejection_counts[reason] += 1
                    candidates.append(
                        {
                            "track_id": tid,
                            "class": cls,
                            "checks": checks,
                            "matched": False,
                            "rejection_reason": reason,
                            "rejection_he": rejection_he(reason),
                        }
                    )
                    continue

            if trigger == "line_cross":
                if line is None:
                    reason = "line_unavailable"
                    checks.append({"key": "line_available", "ok": False})
                else:
                    checks.append({"key": "line_available", "ok": True})
                    lt = LineCrossingTracker()
                    crossed = False
                    dir_ok = False
                    actual_dir = None
                    for det in sorted(obs, key=lambda d: float(d["timestamp"])):
                        try:
                            pt = detection_point_normalized(
                                det.get("bbox") or [], det.get("frame_size") or [1, 1]
                            )
                        except ValueError:
                            continue
                        cross = lt.update(
                            camera_id=camera_id,
                            track_id=tid,
                            line_id=line.id,
                            points=list(line.points_json or []),
                            point=pt,
                            at=_to_dt(float(det["timestamp"])),
                        )
                        if cross:
                            crossed = True
                            actual_dir = cross.direction
                            if direction_matches(cross.direction, required_dir):
                                dir_ok = True
                                break
                    checks.append({"key": "crossing_detected", "ok": crossed})
                    if crossed:
                        checks.append(
                            {
                                "key": "direction_matched",
                                "ok": dir_ok,
                                "actual": actual_dir,
                                "required": required_dir,
                            }
                        )
                    if not crossed:
                        reason = "line_not_crossed"
                    elif not dir_ok:
                        reason = "direction_mismatch"
            elif trigger in {"zone_enter", "zone_exit", "zone_presence", "dwell"}:
                if zone is None:
                    reason = "zone_unavailable"
                    checks.append({"key": "zone_available", "ok": False})
                else:
                    checks.append({"key": "zone_available", "ok": True})
                    from app.domain.zones.geometry import detection_in_zone

                    zt = ZonePresenceTracker()
                    enter_n = exit_n = 0
                    max_dur = 0.0
                    ever_inside = False
                    dwell_thr = min_duration if trigger == "dwell" else None
                    for det in sorted(obs, key=lambda d: float(d["timestamp"])):
                        inside = detection_in_zone(
                            det.get("bbox") or [],
                            det.get("frame_size") or [1, 1],
                            zone.points_json,
                        )
                        if inside:
                            ever_inside = True
                        for tr in zt.update(
                            camera_id=camera_id,
                            track_id=tid,
                            zone_id=zone.id,
                            object_class=cls,
                            inside=inside,
                            at=_to_dt(float(det["timestamp"])),
                            dwell_threshold_sec=dwell_thr,
                        ):
                            if tr.kind == "zone_enter":
                                enter_n += 1
                            elif tr.kind == "zone_exit":
                                exit_n += 1
                            max_dur = max(max_dur, float(tr.duration_seconds or 0))
                    if trigger == "zone_enter":
                        ok = enter_n > 0
                        checks.append({"key": "zone_entered", "ok": ok})
                        if not ok:
                            reason = "zone_not_entered"
                    elif trigger == "zone_exit":
                        ok = exit_n > 0
                        checks.append({"key": "zone_exited", "ok": ok})
                        if not ok:
                            reason = "zone_not_exited"
                    elif trigger == "dwell":
                        checks.append({"key": "inside_zone", "ok": ever_inside})
                        ok = max_dur >= min_duration
                        checks.append(
                            {
                                "key": "dwell_reached",
                                "ok": ok,
                                "duration_sec": round(max_dur, 2),
                                "required_sec": min_duration,
                            }
                        )
                        if not ever_inside:
                            reason = "not_inside_zone"
                        elif not ok:
                            reason = "dwell_not_reached"
                    else:
                        ok = ever_inside
                        checks.append({"key": "inside_zone", "ok": ok})
                        if not ok:
                            reason = "not_inside_zone"
            elif trigger == "count_threshold":
                # Track-level not applicable — counted at aggregation layer
                checks.append({"key": "count_candidate", "ok": True})
            else:
                checks.append({"key": "conditions", "ok": True})

            if reason is None and tid in fired_tracks:
                matched += 1
                checks.append({"key": "event_created", "ok": True})
                candidates.append(
                    {
                        "track_id": tid,
                        "class": cls,
                        "checks": checks,
                        "matched": True,
                        "rejection_reason": None,
                        "rejection_he": None,
                    }
                )
            elif reason is None and rule.id in triggered_rule_ids and trigger == "count_threshold":
                # Aggregation rule — don't attribute per track
                continue
            elif reason is None:
                # Conditions looked ok but no event — likely dedupe/cooldown or pipeline miss
                if tid in fired_tracks:
                    matched += 1
                    candidates.append(
                        {
                            "track_id": tid,
                            "class": cls,
                            "checks": checks,
                            "matched": True,
                            "rejection_reason": None,
                        }
                    )
                else:
                    # Spatial condition may have passed for another track only
                    spatial_failed = any(
                        c.get("key")
                        in {
                            "crossing_detected",
                            "direction_matched",
                            "zone_entered",
                            "zone_exited",
                            "dwell_reached",
                            "inside_zone",
                        }
                        and not c.get("ok")
                        for c in checks
                    )
                    if spatial_failed:
                        # already set reason above
                        pass
                    # If all spatial checks ok but no event
                    all_ok = all(c.get("ok") for c in checks if "ok" in c)
                    if all_ok:
                        reason = "dedupe_blocked"
                        checks.append(
                            {
                                "key": "dedupe_allowed",
                                "ok": False,
                                "detail": f"already fired or blocked for track #{tid}",
                            }
                        )
                    rejected += 1
                    if reason:
                        rejection_counts[reason] += 1
                    candidates.append(
                        {
                            "track_id": tid,
                            "class": cls,
                            "checks": checks,
                            "matched": False,
                            "rejection_reason": reason,
                            "rejection_he": rejection_he(reason),
                        }
                    )
            else:
                rejected += 1
                rejection_counts[reason] += 1
                candidates.append(
                    {
                        "track_id": tid,
                        "class": cls,
                        "checks": checks,
                        "matched": False,
                        "rejection_reason": reason,
                        "rejection_he": rejection_he(reason),
                    }
                )

        # Count threshold / no-candidate summary
        if trigger == "count_threshold":
            matched = 1 if rule.id in triggered_rule_ids else 0
            if matched == 0:
                rejection_counts["threshold_not_reached"] += 1

        top_reasons = sorted(rejection_counts.items(), key=lambda kv: -kv[1])[:5]
        out.append(
            {
                "rule_id": rule.id,
                "rule_name": rule.name,
                "trigger": trigger,
                "enabled": bool(rule.enabled),
                "schedule_warning": schedule_warning if schedule else None,
                "schedule_eval_timestamp": eval_ts_iso,
                "candidate_count": len(candidates),
                "matched_count": matched if trigger != "count_threshold" else matched,
                "rejected_count": rejected,
                "top_rejection_reasons": [
                    {"code": c, "he": rejection_he(c), "count": n} for c, n in top_reasons
                ],
                "candidates": candidates[:50],
                "triggered": rule.id in triggered_rule_ids,
                "events_created": len(events_by_rule.get(rule.id, [])),
            }
        )
    return out


def build_metric_traces(
    *,
    camera_id: str,
    metric_defs: list[Any],
    metric_plans: list[dict[str, Any]],
    detections: list[dict[str, Any]],
    lines: list[Any],
    zones: list[Any],
    base_unix_ts: float,
    metric_totals: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Per-metric contribution traces (line/zone based) from the same detections."""
    line_by_id = {ln.id: ln for ln in lines}
    zone_by_id = {z.id: z for z in zones}
    by_track: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for det in detections:
        tid = det.get("track_id")
        if tid is not None:
            by_track[int(tid)].append(det)

    plan_by_id = {p["metric_definition_id"]: p for p in metric_plans}
    results: list[dict[str, Any]] = []

    for md in metric_defs:
        if getattr(md, "camera_id", None) != camera_id:
            continue
        plan = plan_by_id.get(md.id) or {}
        metric_type = plan.get("metric_type") or getattr(md, "metric_type", "")
        classes = set(plan.get("object_classes") or getattr(md, "object_classes_json", None) or [])
        line_id = plan.get("line_id") or getattr(md, "line_id", None)
        zone_id = plan.get("zone_id") or getattr(md, "zone_id", None)
        direction = plan.get("direction") or getattr(md, "direction", None) or "any"
        line = line_by_id.get(line_id) if line_id else None
        zone = zone_by_id.get(zone_id) if zone_id else None

        contributions: list[dict[str, Any]] = []
        final_value = 0.0

        if metric_type in {"entries", "exits", "line_crossings"} and line is not None:
            want_dir = direction
            if metric_type == "entries" and (not direction or direction == "any"):
                want_dir = "a_to_b"
            if metric_type == "exits" and (not direction or direction == "any"):
                want_dir = "b_to_a"
            for tid, obs in by_track.items():
                cls = str(obs[0].get("class") or "")
                if classes and cls not in classes:
                    continue
                lt = LineCrossingTracker()
                crossed = False
                dir_ok = False
                actual = None
                for det in sorted(obs, key=lambda d: float(d["timestamp"])):
                    try:
                        pt = detection_point_normalized(
                            det.get("bbox") or [], det.get("frame_size") or [1, 1]
                        )
                    except ValueError:
                        continue
                    cross = lt.update(
                        camera_id=camera_id,
                        track_id=tid,
                        line_id=line.id,
                        points=list(line.points_json or []),
                        point=pt,
                        at=_to_dt(float(det["timestamp"])),
                    )
                    if cross:
                        crossed = True
                        actual = cross.direction
                        if metric_type == "line_crossings":
                            if direction_matches(cross.direction, want_dir):
                                dir_ok = True
                                break
                        elif direction_matches(cross.direction, want_dir):
                            dir_ok = True
                            break
                delta = 0
                reason = None
                if not crossed:
                    reason = "line_not_crossed"
                elif not dir_ok and metric_type != "line_crossings":
                    reason = "direction_mismatch"
                elif not dir_ok and metric_type == "line_crossings" and want_dir not in {"", "any"}:
                    reason = "direction_mismatch"
                else:
                    delta = 1
                    final_value += 1
                contributions.append(
                    {
                        "track_id": tid,
                        "class": cls,
                        "delta": delta,
                        "checks": [
                            {"key": "object_matched", "ok": True},
                            {"key": "track_confirmed", "ok": True},
                            {"key": "line_crossed", "ok": crossed},
                            {
                                "key": "direction_matched",
                                "ok": dir_ok if crossed else False,
                                "actual": actual,
                                "required": want_dir,
                            },
                        ],
                        "rejection_reason": reason,
                        "rejection_he": rejection_he(reason),
                    }
                )
        elif metric_type == "objects_observed":
            seen = set()
            for tid, obs in by_track.items():
                cls = str(obs[0].get("class") or "")
                if classes and cls not in classes:
                    continue
                if zone is not None:
                    from app.domain.zones.geometry import detection_in_zone

                    ever = any(
                        detection_in_zone(
                            d.get("bbox") or [], d.get("frame_size") or [1, 1], zone.points_json
                        )
                        for d in obs
                    )
                    if not ever:
                        contributions.append(
                            {
                                "track_id": tid,
                                "class": cls,
                                "delta": 0,
                                "rejection_reason": "not_inside_zone",
                                "rejection_he": rejection_he("not_inside_zone"),
                            }
                        )
                        continue
                seen.add(tid)
                contributions.append({"track_id": tid, "class": cls, "delta": 1})
            final_value = float(len(seen))
        elif metric_type in {"occupancy_current", "occupancy_peak", "dwell_avg", "dwell_max"} and zone:
            from app.domain.zones.geometry import detection_in_zone

            # Occupancy over time from track anchors
            peak = 0
            current_ids: set[int] = set()
            dwells: list[float] = []
            # Sort all observations by time
            timeline: list[tuple[float, int, str, bool]] = []
            for tid, obs in by_track.items():
                cls = str(obs[0].get("class") or "")
                if classes and cls not in classes:
                    continue
                for det in obs:
                    inside = detection_in_zone(
                        det.get("bbox") or [], det.get("frame_size") or [1, 1], zone.points_json
                    )
                    timeline.append((float(det["timestamp"]), tid, cls, inside))
            timeline.sort(key=lambda x: x[0])
            enter_ts: dict[int, float] = {}
            for ts, tid, cls, inside in timeline:
                if inside and tid not in current_ids:
                    current_ids.add(tid)
                    enter_ts[tid] = ts
                    peak = max(peak, len(current_ids))
                elif not inside and tid in current_ids:
                    current_ids.discard(tid)
                    if tid in enter_ts:
                        dwells.append(ts - enter_ts.pop(tid))
            # Finalize unfinished dwells at video end
            if timeline:
                end_ts = timeline[-1][0]
                for tid, start in list(enter_ts.items()):
                    dwells.append(end_ts - start)
                    contributions.append(
                        {
                            "track_id": tid,
                            "delta": round(end_ts - start, 3),
                            "note": "finalized_at_video_end",
                        }
                    )
            if metric_type == "occupancy_peak":
                final_value = float(peak)
            elif metric_type == "occupancy_current":
                final_value = float(len(current_ids))
            elif metric_type == "dwell_avg":
                final_value = round(sum(dwells) / len(dwells), 3) if dwells else 0.0
            elif metric_type == "dwell_max":
                final_value = round(max(dwells), 3) if dwells else 0.0

        # Prefer engine totals when provided
        if metric_totals and md.id in metric_totals:
            final_value = metric_totals[md.id]

        results.append(
            {
                "metric_definition_id": md.id,
                "metric_name": getattr(md, "name", None) or getattr(md, "name_he", "") or md.id,
                "metric_type": metric_type,
                "final_value": final_value,
                "contributions": contributions[:80],
                "contributing_tracks": [c["track_id"] for c in contributions if c.get("delta")],
                "rejected_tracks": [
                    {
                        "track_id": c["track_id"],
                        "reason": c.get("rejection_reason"),
                        "he": c.get("rejection_he"),
                    }
                    for c in contributions
                    if c.get("delta") == 0 and c.get("rejection_reason")
                ],
                "semantics_he": plan.get("semantics_he"),
            }
        )
    return results


def build_funnel(
    *,
    detections: list[dict[str, Any]],
    tracks: list[dict[str, Any]],
    spatial_crossings: int,
    spatial_zone_enters: int,
    spatial_zone_exits: int,
    metric_contributions: int,
    rule_matches: int,
    events_created: int,
) -> dict[str, Any]:
    raw = len(detections)
    # accepted ≈ detections that became tracks (same in this pipeline)
    accepted = raw
    confirmed = len(tracks)
    spatial = spatial_crossings + spatial_zone_enters + spatial_zone_exits
    return {
        "stages": [
            {"key": "raw_detections", "label_he": "זיהויים גולמיים", "count": raw},
            {"key": "accepted_detections", "label_he": "זיהויים שהתקבלו", "count": accepted},
            {"key": "confirmed_tracks", "label_he": "מסלולים מאושרים", "count": confirmed},
            {
                "key": "spatial_occurrences",
                "label_he": "אירועים מרחביים",
                "count": spatial,
                "detail": {
                    "line_crossings": spatial_crossings,
                    "zone_enters": spatial_zone_enters,
                    "zone_exits": spatial_zone_exits,
                },
            },
            {"key": "metric_matches", "label_he": "תרומות מדדים", "count": metric_contributions},
            {"key": "rule_matches", "label_he": "התאמות חוקים", "count": rule_matches},
            {"key": "events", "label_he": "אירועים", "count": events_created},
        ],
        "summary_line": (
            f"{raw} raw → {accepted} accepted → {confirmed} tracks → "
            f"{spatial} spatial → {metric_contributions} metrics → "
            f"{rule_matches} rules → {events_created} events"
        ),
    }


def build_debug_bundle(
    *,
    run_id: str,
    camera_id: str,
    asset: Any,
    rules: list[Any],
    metric_defs: list[Any],
    zones: list[Any],
    lines: list[Any],
    detections: list[dict[str, Any]],
    overlays: list[dict[str, Any]],
    base_unix_ts: float,
    frame_stride: int,
    detection_threshold: float,
    frames_read: int,
    frames_analyzed: int,
    triggered_rule_ids: set[str],
    event_rows: list[Any],
    event_ids: list[str],
    hits: list[dict[str, Any]],
    search_classes: list[str],
    correctness_mode: bool,
    test_start_datetime: str | None = None,
    expected: dict[str, Any] | None = None,
    metric_totals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    plans = compile_camera_execution_plans(
        camera_id=camera_id, rules=rules, metric_defs=metric_defs
    )

    schedule_warning = None
    schedule_eval_ts: datetime | None = None
    if test_start_datetime:
        try:
            schedule_eval_ts = datetime.fromisoformat(test_start_datetime.replace("Z", "+00:00"))
            if schedule_eval_ts.tzinfo is None:
                schedule_eval_ts = schedule_eval_ts.replace(tzinfo=UTC)
        except ValueError:
            schedule_warning = "test_start_datetime לא תקין — הערכת לוח זמנים עלולה להיות מטעה"
    else:
        has_scheduled = any(
            isinstance((r.conditions_json or {}).get("schedule"), dict) for r in rules
        )
        if has_scheduled:
            schedule_warning = (
                "אין test_start_datetime לסרטון — חוקים מתוזמנים מוערכים מול זמן בסיס הווידאו "
                f"({datetime.fromtimestamp(base_unix_ts, tz=UTC).isoformat()}) ולא מול שעון אמיתי"
            )
        schedule_eval_ts = datetime.fromtimestamp(base_unix_ts, tz=UTC)

    tracks = build_track_debug(
        detections,
        base_unix_ts=base_unix_ts,
        zones=zones,
        lines=lines,
        camera_id=camera_id,
    )
    # Enrich overlays with spatial anchors (bottom-center)
    enriched_overlays = []
    for frame in overlays:
        boxes = []
        for b in frame.get("boxes") or []:
            bbox = list(b.get("bbox") or [])
            boxes.append({**b, "anchor_px": _anchor_px(bbox)})
        enriched_overlays.append({**frame, "boxes": boxes})

    rule_checks = diagnose_rules(
        camera_id=camera_id,
        rules=rules,
        zones=zones,
        lines=lines,
        detections=detections,
        base_unix_ts=base_unix_ts,
        triggered_rule_ids=triggered_rule_ids,
    )
    for check in rule_checks:
        code = STATUS_TO_REJECTION.get(str(check.get("status") or ""))
        if check.get("status") == "object_not_in_zone" and check.get("trigger") == "line_cross":
            code = "line_not_crossed"
        check["rejection_reason"] = code
        check["rejection_he"] = rejection_he(code)

    rule_traces = build_rule_candidate_traces(
        camera_id=camera_id,
        rules=rules,
        zones=zones,
        lines=lines,
        detections=detections,
        base_unix_ts=base_unix_ts,
        triggered_rule_ids=triggered_rule_ids,
        event_rows=event_rows,
        schedule_eval_ts=schedule_eval_ts,
        schedule_warning=schedule_warning,
    )

    metric_traces = build_metric_traces(
        camera_id=camera_id,
        metric_defs=metric_defs,
        metric_plans=plans["metrics"],
        detections=detections,
        lines=lines,
        zones=zones,
        base_unix_ts=base_unix_ts,
        metric_totals=metric_totals,
    )

    spatial_crossings = sum(len(t.get("crossings") or []) for t in tracks)
    zone_enters = 0
    zone_exits = 0
    for t in tracks:
        hist = t.get("zone_history") or []
        prev: dict[str, str] = {}
        for z in hist:
            zid = z["zone_id"]
            st = z["state"]
            if prev.get(zid) == "outside" and st == "inside":
                zone_enters += 1
            if prev.get(zid) == "inside" and st == "outside":
                zone_exits += 1
            prev[zid] = st

    metric_contrib = sum(
        len(m.get("contributing_tracks") or []) for m in metric_traces
    )
    rule_matches = sum(1 for r in rule_traces if r.get("triggered"))

    funnel = build_funnel(
        detections=detections,
        tracks=tracks,
        spatial_crossings=spatial_crossings,
        spatial_zone_enters=zone_enters,
        spatial_zone_exits=zone_exits,
        metric_contributions=metric_contrib,
        rule_matches=rule_matches,
        events_created=len(event_ids),
    )

    per_class = build_per_class_summary(detections)

    event_markers = [
        {
            "event_id": h.get("event_id"),
            "video_sec": h.get("timestamp_sec"),
            "label_he": h.get("message_he") or h.get("rule_name") or "EVENT",
            "rule_id": h.get("rule_id"),
            "track_id": h.get("track_id"),
        }
        for h in hits
    ]

    expected_vs_actual = None
    if expected and isinstance(expected, dict):
        rows = []
        actual_map: dict[str, Any] = {}
        for m in metric_traces:
            key = m.get("metric_type")
            actual_map[str(key)] = m.get("final_value")
            actual_map[str(m.get("metric_name"))] = m.get("final_value")
        for r in rule_traces:
            actual_map[f"events:{r['rule_id']}"] = r.get("events_created", 0)
            actual_map[f"events:{r['rule_name']}"] = r.get("events_created", 0)
        exp_metrics = expected.get("metrics") or expected
        if isinstance(exp_metrics, dict):
            for k, exp_v in exp_metrics.items():
                if k in {"events", "expected"}:
                    continue
                rows.append(
                    {
                        "label": k,
                        "expected": exp_v,
                        "actual": actual_map.get(k),
                    }
                )
        exp_events = expected.get("events") if isinstance(expected.get("events"), dict) else {}
        for k, exp_v in exp_events.items():
            rows.append(
                {
                    "label": f"events:{k}",
                    "expected": exp_v,
                    "actual": actual_map.get(f"events:{k}"),
                }
            )
        expected_vs_actual = rows

    config_snapshot = {
        "mode": "correctness" if correctness_mode else "performance",
        "mode_he": "מצב בדיקת דיוק" if correctness_mode else "מצב ביצועים",
        "frame_stride": frame_stride,
        "detection_threshold": detection_threshold,
        "search_classes": search_classes,
        "search_classes_he": [class_he(c) for c in search_classes],
        "vehicle_group": vehicle_group_resolution(),
        "spatial_anchor": "bbox_bottom_center",
        "spatial_anchor_he": "נקודת עוגן = מרכז תחתון של תיבת הזיהוי",
        "test_start_datetime": test_start_datetime,
        "base_unix_ts": base_unix_ts,
        "schedule_eval_timestamp": schedule_eval_ts.isoformat() if schedule_eval_ts else None,
        "schedule_warning": schedule_warning,
        "execution_plans": plans,
        "zones": [
            {
                "id": z.id,
                "name": z.name,
                "enabled": z.enabled,
                "points": z.points_json,
            }
            for z in zones
        ],
        "lines": [
            {
                "id": ln.id,
                "name": ln.name,
                "enabled": ln.enabled,
                "points": ln.points_json,
                "label_a_to_b": getattr(ln, "label_a_to_b", None),
                "label_b_to_a": getattr(ln, "label_b_to_a", None),
            }
            for ln in lines
        ],
        "asset": {
            "id": getattr(asset, "id", None),
            "name_he": getattr(asset, "name_he", None),
            "duration_sec": getattr(asset, "duration_sec", None),
            "frame_count": getattr(asset, "frame_count", None),
        },
    }

    return {
        "schema_version": "1.0",
        "run_id": run_id,
        "correctness_mode": correctness_mode,
        "mode_he": "מצב בדיקת דיוק" if correctness_mode else "מצב ביצועים",
        "summary": {
            "run_id": run_id,
            "video_frames": frames_read,
            "frames_analyzed": frames_analyzed,
            "stride": frame_stride,
            "detection_threshold": detection_threshold,
            "detections": len(detections),
            "confirmed_tracks": len(tracks),
            "line_crossings": spatial_crossings,
            "zone_enters": zone_enters,
            "zone_exits": zone_exits,
            "metric_contributions": metric_contrib,
            "events_created": len(event_ids),
        },
        "funnel": funnel,
        "per_class": per_class,
        "tracks": tracks,
        "rule_checks": rule_checks,
        "rule_traces": rule_traces,
        "metric_traces": metric_traces,
        "event_markers": event_markers,
        "overlays": enriched_overlays,
        "config": config_snapshot,
        "expected_vs_actual": expected_vs_actual,
        "rejection_reason_catalog": REJECTION_REASON_HE,
    }
