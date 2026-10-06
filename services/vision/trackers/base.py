"""Replaceable object trackers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from detectors.base import RawDetection


@dataclass(frozen=True, slots=True)
class TrackedDetection:
    class_name: str
    confidence: float
    bbox: tuple[float, float, float, float]
    track_id: int


class Tracker(Protocol):
    """Generic tracker interface — Product Layer must not depend on ByteTrack internals."""

    def update(
        self,
        detections: list[RawDetection],
        *,
        frame_size: tuple[int, int] | None = None,
        timestamp: float | None = None,
    ) -> list[TrackedDetection]: ...

    def reset(self) -> None: ...

    @property
    def name(self) -> str: ...
