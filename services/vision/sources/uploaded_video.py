"""Uploaded MP4 as a CameraSource."""

from __future__ import annotations

from pathlib import Path
from typing import Iterator

import cv2
import numpy as np

from sources.base import CameraSource, FramePacket, VideoMetadata
from sources.metadata import probe_video


class UploadedVideoSource:
    """Treat a local MP4 as a camera stream (development Video Test Lab)."""

    def __init__(self, *, camera_id: str, path: Path) -> None:
        self._camera_id = camera_id
        self._path = Path(path)
        if not self._path.is_file():
            raise FileNotFoundError(str(self._path))
        self._meta = probe_video(self._path)

    @property
    def camera_id(self) -> str:
        return self._camera_id

    @property
    def source_kind(self) -> str:
        return "uploaded_video"

    def metadata(self) -> VideoMetadata:
        return self._meta

    def first_frame(self) -> FramePacket | None:
        for packet in self.frames(max_frames=1):
            return packet
        return None

    def frames(self, *, max_frames: int | None = None) -> Iterator[FramePacket]:
        cap = cv2.VideoCapture(str(self._path))
        if not cap.isOpened():
            raise RuntimeError("cannot_open_video")
        try:
            fps = self._meta.fps if self._meta.fps > 0 else 25.0
            index = 0
            while True:
                if max_frames is not None and index >= max_frames:
                    break
                ok, frame = cap.read()
                if not ok or frame is None:
                    break
                h, w = frame.shape[:2]
                ts = index / fps
                yield FramePacket(
                    frame_index=index,
                    timestamp_sec=ts,
                    image_bgr=frame,
                    width=int(w),
                    height=int(h),
                )
                index += 1
        finally:
            cap.release()


class MockSource:
    """Synthetic frames for unit tests (no real file required)."""

    def __init__(
        self,
        *,
        camera_id: str = "mock_cam",
        width: int = 320,
        height: int = 240,
        fps: float = 10.0,
        frame_count: int = 30,
        moving_box: bool = True,
    ) -> None:
        self._camera_id = camera_id
        self._width = width
        self._height = height
        self._fps = fps
        self._frame_count = frame_count
        self._moving_box = moving_box

    @property
    def camera_id(self) -> str:
        return self._camera_id

    @property
    def source_kind(self) -> str:
        return "mock"

    def metadata(self) -> VideoMetadata:
        return VideoMetadata(
            duration_sec=self._frame_count / self._fps,
            width=self._width,
            height=self._height,
            fps=self._fps,
            codec="synthetic",
            frame_count=self._frame_count,
        )

    def first_frame(self) -> FramePacket | None:
        return next(self.frames(max_frames=1), None)

    def frames(self, *, max_frames: int | None = None) -> Iterator[FramePacket]:
        limit = self._frame_count if max_frames is None else min(self._frame_count, max_frames)
        for i in range(limit):
            img = np.zeros((self._height, self._width, 3), dtype=np.uint8)
            img[:] = (40, 40, 40)
            if self._moving_box:
                x1 = 20 + i * 4
                y1 = 40
                x2 = x1 + 60
                y2 = y1 + 120
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), -1)
            yield FramePacket(
                frame_index=i,
                timestamp_sec=i / self._fps,
                image_bgr=img,
                width=self._width,
                height=self._height,
            )
