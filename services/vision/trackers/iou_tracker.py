"""Lightweight IoU tracker inspired by ByteTrack (no external tracker deps)."""

from __future__ import annotations

from dataclasses import dataclass

from detectors.base import RawDetection
from trackers.base import TrackedDetection


@dataclass
class _Track:
    track_id: int
    class_name: str
    bbox: tuple[float, float, float, float]
    confidence: float
    misses: int = 0


class IoUTracker:
    """Greedy IoU association with stable track_id across frames (fallback/debug)."""

    def __init__(self, *, iou_threshold: float = 0.2, max_misses: int = 30) -> None:
        self._iou_threshold = iou_threshold
        self._max_misses = max_misses
        self._next_id = 1
        self._tracks: list[_Track] = []

    @property
    def name(self) -> str:
        return "iou"

    def reset(self) -> None:
        self._next_id = 1
        self._tracks = []

    def update(
        self,
        detections: list[RawDetection],
        *,
        frame_size: tuple[int, int] | None = None,
        timestamp: float | None = None,
    ) -> list[TrackedDetection]:
        _ = frame_size, timestamp
        if not self._tracks:
            out: list[TrackedDetection] = []
            for det in detections:
                tid = self._next_id
                self._next_id += 1
                self._tracks.append(
                    _Track(tid, det.class_name, det.bbox, det.confidence, 0)
                )
                out.append(
                    TrackedDetection(det.class_name, det.confidence, det.bbox, tid)
                )
            return out

        assigned_tracks: set[int] = set()
        assigned_dets: set[int] = set()
        pairs: list[tuple[float, int, int]] = []
        for ti, tr in enumerate(self._tracks):
            for di, det in enumerate(detections):
                if det.class_name != tr.class_name:
                    continue
                iou = _iou(tr.bbox, det.bbox)
                if iou >= self._iou_threshold:
                    pairs.append((iou, ti, di))
        pairs.sort(reverse=True)

        results: list[TrackedDetection] = []
        for _, ti, di in pairs:
            if ti in assigned_tracks or di in assigned_dets:
                continue
            assigned_tracks.add(ti)
            assigned_dets.add(di)
            det = detections[di]
            tr = self._tracks[ti]
            tr.bbox = det.bbox
            tr.confidence = det.confidence
            tr.misses = 0
            results.append(
                TrackedDetection(det.class_name, det.confidence, det.bbox, tr.track_id)
            )

        for di, det in enumerate(detections):
            if di in assigned_dets:
                continue
            tid = self._next_id
            self._next_id += 1
            self._tracks.append(_Track(tid, det.class_name, det.bbox, det.confidence, 0))
            results.append(
                TrackedDetection(det.class_name, det.confidence, det.bbox, tid)
            )

        surviving: list[_Track] = []
        for ti, tr in enumerate(self._tracks):
            if ti in assigned_tracks:
                surviving.append(tr)
                continue
            tr.misses += 1
            if tr.misses <= self._max_misses:
                surviving.append(tr)
        self._tracks = surviving
        return results

    def diagnostics(self) -> dict:
        return {
            "implementation": "iou",
            "unique_tracks": self._next_id - 1,
            "track_creations": self._next_id - 1,
            "track_losses": 0,
            "average_track_lifetime_frames": 0,
            "detections_without_stable_track_id": 0,
        }


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0
