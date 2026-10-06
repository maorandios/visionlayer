"""Benchmark Run metrics — definitions must stay unambiguous.

Detection
    One accepted model output on one analyzed frame (after conf/NMS).

Unique Track
    One unique ByteTrack track_id across frames.

Event
    One persisted VisionLayer Event produced by a Rule (not detections/zone hops).

False Positive
    A unique track manually marked as incorrect detection/classification.
    Rate = false_positive_tracks / reviewed_tracks (null if reviewed_tracks == 0).

Analysis Time
    Wall-clock seconds for the full backend pipeline:
    video → detect → track → rules → events → gallery.

Processing FPS
    video_frames_total / analysis_time_seconds
    (distinct from source_video_fps and from detector-only throughput).
"""

from __future__ import annotations

from typing import Any, Literal

ReviewStatus = Literal["correct", "false_positive", "unreviewed"]
VALID_REVIEW_STATUSES = frozenset({"correct", "false_positive", "unreviewed"})


def processing_fps(*, video_frames_total: int, analysis_time_seconds: float) -> float:
    """frames walked in the video / full analysis wall-clock."""
    if analysis_time_seconds <= 0:
        return 0.0
    return float(video_frames_total) / float(analysis_time_seconds)


def false_positive_stats(reviews: list[dict[str, Any]] | dict[int, str]) -> dict[str, Any]:
    """Compute FP counters. Rate is null when nothing has been reviewed."""
    statuses: list[str]
    if isinstance(reviews, dict):
        statuses = [str(v) for v in reviews.values()]
    else:
        statuses = [str(r.get("review_status") or "unreviewed") for r in reviews]

    correct = sum(1 for s in statuses if s == "correct")
    false_pos = sum(1 for s in statuses if s == "false_positive")
    unreviewed = sum(1 for s in statuses if s == "unreviewed")
    # Also count tracks with no review row as unreviewed when total known separately
    reviewed = correct + false_pos
    rate: float | None
    if reviewed <= 0:
        rate = None
    else:
        rate = false_pos / reviewed

    return {
        "reviewed_tracks": reviewed,
        "correct_tracks": correct,
        "false_positive_tracks": false_pos,
        "unreviewed_tracks": unreviewed,
        "false_positive_rate": rate,
    }


def events_breakdown(event_rows: list[Any]) -> tuple[dict[str, int], dict[str, int]]:
    by_rule: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for row in event_rows:
        rule_id = getattr(row, "rule_id", None) or (row.get("rule_id") if isinstance(row, dict) else None)
        etype = getattr(row, "type", None) or (row.get("type") if isinstance(row, dict) else None)
        if rule_id:
            key = str(rule_id)
            by_rule[key] = by_rule.get(key, 0) + 1
        if etype:
            key = str(etype)
            by_type[key] = by_type.get(key, 0) + 1
    return by_rule, by_type


def model_display_name(model_path: str | None, detector_name: str) -> str:
    if model_path:
        stem = str(model_path).replace("\\", "/").rsplit("/", 1)[-1]
        stem = stem.removesuffix(".onnx")
        return stem.upper().replace("_", "-") if stem.startswith("yolox") else stem
    if detector_name:
        return detector_name
    return "unknown"
