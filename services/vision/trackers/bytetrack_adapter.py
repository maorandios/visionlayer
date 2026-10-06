"""ByteTrackAdapter — VisionLayer Tracker behind a class-aware ByteTrack core.

Keeps Product Layer / Rule Engine / Zone Engine free of ByteTrack internals.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from detectors.base import RawDetection
from trackers.base import TrackedDetection
from trackers.bytetrack_core import ByteTrackerCore
from trackers.config import DEFAULT_TRACKER_CONFIG, TrackerConfig


class ByteTrackAdapter:
    """Default Video Test Lab tracker: ByteTrack, one core per object class."""

    def __init__(
        self,
        *,
        config: TrackerConfig | None = None,
        frame_rate: float | None = None,
    ) -> None:
        self.config = config or DEFAULT_TRACKER_CONFIG
        self._frame_rate = float(frame_rate) if frame_rate and frame_rate > 0 else self.config.default_fps
        self._by_class: dict[str, ByteTrackerCore] = {}
        self._next_global_id = 1
        self._last_frame_size: tuple[int, int] | None = None
        self._last_timestamp: float | None = None

    @property
    def name(self) -> str:
        return "bytetrack"

    def reset(self) -> None:
        self._by_class.clear()
        self._next_global_id = 1
        self._last_frame_size = None
        self._last_timestamp = None

    def _next_id(self) -> int:
        tid = self._next_global_id
        self._next_global_id += 1
        return tid

    def _core_for(self, class_name: str) -> ByteTrackerCore:
        if class_name not in self._by_class:
            self._by_class[class_name] = ByteTrackerCore(
                self.config,
                frame_rate=self._frame_rate,
                id_factory=self._next_id,
            )
        return self._by_class[class_name]

    def update(
        self,
        detections: list[RawDetection],
        *,
        frame_size: tuple[int, int] | None = None,
        timestamp: float | None = None,
    ) -> list[TrackedDetection]:
        if frame_size is not None:
            self._last_frame_size = (int(frame_size[0]), int(frame_size[1]))
        if timestamp is not None:
            self._last_timestamp = float(timestamp)

        by_cls: dict[str, list[RawDetection]] = {}
        for det in detections:
            by_cls.setdefault(det.class_name, []).append(det)

        # Advance all known classes (including those with zero dets this frame)
        for cls, core in list(self._by_class.items()):
            if cls not in by_cls:
                core.update(np.zeros((0, 4), dtype=np.float32), np.zeros((0,), dtype=np.float32), cls)

        out: list[TrackedDetection] = []
        for class_name, dets in by_cls.items():
            boxes = np.array([d.bbox for d in dets], dtype=np.float32)
            scores = np.array([d.confidence for d in dets], dtype=np.float32)
            core = self._core_for(class_name)
            tracks = core.update(boxes, scores, class_name)
            for tr in tracks:
                tlbr = tr.tlbr
                out.append(
                    TrackedDetection(
                        class_name=tr.class_name,
                        confidence=float(tr.score),
                        bbox=(float(tlbr[0]), float(tlbr[1]), float(tlbr[2]), float(tlbr[3])),
                        track_id=int(tr.track_id),
                    )
                )
        return out

    def diagnostics(self) -> dict[str, Any]:
        creations = 0
        losses = 0
        lifetimes: list[int] = []
        unique: set[int] = set()
        for core in self._by_class.values():
            creations += core.stats.creations
            losses += core.stats.losses
            lifetimes.extend(core.stats.lifetimes)
            # active + historical ids
            unique |= set(core.stats.unique_ids)
            for t in core.tracked + core.lost:
                unique.add(t.track_id)
                lifetimes.append(max(1, t.frames_seen))
        avg_life = float(sum(lifetimes) / len(lifetimes)) if lifetimes else 0.0
        return {
            "implementation": "bytetrack",
            "license_note": "Clean-room ByteTrack algorithm (paper arXiv:2110.06864); no AGPL deps",
            "frame_rate": self._frame_rate,
            "config": self.config.to_dict(),
            "unique_tracks": len(unique),
            "track_creations": creations,
            "track_losses": losses,
            "average_track_lifetime_frames": round(avg_life, 2),
            "detections_without_stable_track_id": 0,
            "classes_tracked": sorted(self._by_class.keys()),
        }


# Public alias matching the task naming
ByteTrackTracker = ByteTrackAdapter
