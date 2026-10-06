"""Representative frame selection — mirrors vision/pipeline/track_results scoring."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TrackObservation:
    confidence: float
    timestamp_sec: float
    frame_index: int
    bbox: list[float]
    frame_w: int
    frame_h: int
    object_class: str


def _area(bbox: list[float]) -> float:
    return max(0.0, float(bbox[2] - bbox[0])) * max(0.0, float(bbox[3] - bbox[1]))


def _edge_score(bbox: list[float], w: int, h: int, margin: float = 0.02) -> float:
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


def score_observation(obs: TrackObservation) -> float:
    area = _area(obs.bbox)
    frame_area = max(1.0, float(obs.frame_w * obs.frame_h))
    area_norm = min(1.0, area / (frame_area * 0.15))
    edge = _edge_score(obs.bbox, obs.frame_w, obs.frame_h)
    return float(obs.confidence) * 0.55 + area_norm * 0.30 + edge * 0.15


def proximity_to_trigger(obs: TrackObservation, trigger_sec: float, window_sec: float = 3.0) -> float:
    dt = abs(obs.timestamp_sec - trigger_sec)
    if window_sec <= 0:
        return 0.0
    return max(0.0, 1.0 - dt / window_sec)


def score_for_event_trigger(obs: TrackObservation, trigger_sec: float) -> float:
    base = score_observation(obs)
    prox = proximity_to_trigger(obs, trigger_sec)
    return base * 0.65 + prox * 0.35


def observations_by_track(
    detections: list[dict[str, Any]],
    *,
    base_unix_ts: float,
) -> dict[int, list[TrackObservation]]:
    by_track: dict[int, list[TrackObservation]] = defaultdict(list)
    for det in detections:
        tid = det.get("track_id")
        if tid is None:
            continue
        if det.get("type") and det.get("type") != "detection":
            continue
        fs = det.get("frame_size") or [1, 1]
        abs_ts = float(det["timestamp"])
        by_track[int(tid)].append(
            TrackObservation(
                confidence=float(det.get("confidence") or 0),
                timestamp_sec=abs_ts - float(base_unix_ts),
                frame_index=int(det.get("frame_index") or 0),
                bbox=[float(x) for x in (det.get("bbox") or [0, 0, 0, 0])],
                frame_w=int(fs[0]),
                frame_h=int(fs[1]),
                object_class=str(det.get("class") or "unknown"),
            )
        )
    return dict(by_track)


def pick_representative_observation(
    observations: list[TrackObservation],
    *,
    trigger_sec: float,
) -> TrackObservation | None:
    if not observations:
        return None
    return max(observations, key=lambda o: score_for_event_trigger(o, trigger_sec))
