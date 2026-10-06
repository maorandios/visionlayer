"""Camera source abstractions — video today, RTSP later."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, Protocol, runtime_checkable

import numpy as np


@dataclass(frozen=True, slots=True)
class FramePacket:
    """One decoded frame with video-relative timestamp (seconds)."""

    frame_index: int
    timestamp_sec: float
    image_bgr: np.ndarray
    width: int
    height: int


@dataclass(frozen=True, slots=True)
class VideoMetadata:
    duration_sec: float
    width: int
    height: int
    fps: float
    codec: str
    frame_count: int | None


@runtime_checkable
class CameraSource(Protocol):
    """Unified frame source for virtual cameras and (future) RTSP."""

    @property
    def camera_id(self) -> str: ...

    @property
    def source_kind(self) -> str: ...

    def metadata(self) -> VideoMetadata: ...

    def frames(self, *, max_frames: int | None = None) -> Iterator[FramePacket]: ...

    def first_frame(self) -> FramePacket | None: ...
