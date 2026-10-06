"""Build unique-track gallery results (UI presentation — not Detection schema)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any


@dataclass
class _Obs:
    confidence: float
    timestamp_sec: float
    frame_index: int
    bbox: list[float]
    frame_w: int
    frame_h: int


def _area(bbox: list[float]) -> float:
    return max(0.0, float(bbox[2] - bbox[0])) * max(0.0, float(bbox[3] - bbox[1]))


def _edge_score(bbox: list[float], w: int, h: int, margin: float = 0.02) -> float:
    """1.0 if comfortably inside, lower if clipped near edges."""
    if w <= 0 or h <= 0:
        return 0.5
    x1, y1, x2, y2 = bbox
    mx, my = w * margin, h * margin
    pen = 0.0
    if x1 < mx:
        pen += 0.25
    if y1 < my:
        pen += 0.25
    if x2 > w - mx:
        pen += 0.25
    if y2 > h - my:
        pen += 0.25
    return max(0.0, 1.0 - pen)


def score_observation(obs: _Obs) -> float:
    """Deterministic quality score for representative-frame selection."""
    area = _area(obs.bbox)
    frame_area = max(1.0, float(obs.frame_w * obs.frame_h))
    area_norm = min(1.0, area / (frame_area * 0.15))  # ~15% of frame = full score
    edge = _edge_score(obs.bbox, obs.frame_w, obs.frame_h)
    return float(obs.confidence) * 0.55 + area_norm * 0.30 + edge * 0.15


def build_track_gallery(
    detections: list[dict[str, Any]],
    *,
    base_unix_ts: float,
) -> list[dict[str, Any]]:
    """One entry per unique track_id with best representative observation."""
    by_track: dict[int, list[_Obs]] = defaultdict(list)
    class_of: dict[int, str] = {}
    for det in detections:
        tid = det.get("track_id")
        if tid is None:
            continue
        tid_i = int(tid)
        cls = str(det.get("class") or "")
        class_of[tid_i] = cls
        fs = det.get("frame_size") or [1, 1]
        abs_ts = float(det["timestamp"])
        by_track[tid_i].append(
            _Obs(
                confidence=float(det.get("confidence") or 0),
                timestamp_sec=abs_ts - float(base_unix_ts),
                frame_index=int(det.get("frame_index") or 0),
                bbox=[float(x) for x in (det.get("bbox") or [0, 0, 0, 0])],
                frame_w=int(fs[0]),
                frame_h=int(fs[1]),
            )
        )

    cards: list[dict[str, Any]] = []
    for tid, obs_list in sorted(by_track.items(), key=lambda kv: kv[0]):
        best = max(obs_list, key=score_observation)
        first = min(o.timestamp_sec for o in obs_list)
        last = max(o.timestamp_sec for o in obs_list)
        cards.append(
            {
                "track_id": tid,
                "class": class_of.get(tid, "unknown"),
                "confidence": round(best.confidence, 4),
                "confidence_pct": int(round(best.confidence * 100)),
                "first_seen": round(first, 3),
                "last_seen": round(last, 3),
                "duration": round(max(0.0, last - first), 3),
                "representative_timestamp": round(best.timestamp_sec, 3),
                "frame_index": best.frame_index,
                "bbox": best.bbox,
                "observations": len(obs_list),
                "quality_score": round(score_observation(best), 4),
            }
        )
    return cards


def fragmentation_hints(track_cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flag possible fragmented tracks (many short same-class tracks close in time)."""
    by_cls: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for card in track_cards:
        by_cls[str(card["class"])].append(card)
    hints: list[dict[str, Any]] = []
    for cls, cards in by_cls.items():
        short = [c for c in cards if float(c["duration"]) < 0.4 and int(c["observations"]) <= 3]
        if len(short) >= 4:
            hints.append(
                {
                    "class": cls,
                    "short_tracks": len(short),
                    "message_he": (
                        f"ייתכן פיצול מסלולים במחלקת {cls}: "
                        f"{len(short)} מסלולים קצרים מאוד"
                    ),
                }
            )
    return hints
