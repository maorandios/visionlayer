"""Development VisionAdapter — real ONNX detection for Video Test Lab.

Implements VisionAdapter. Prefer lab_api.run_video_lab_analysis for Product Layer jobs.
"""

from __future__ import annotations

from pathlib import Path

from adapters.base import (
    AdapterSource,
    CameraStreamConfig,
    DetectionHandler,
    VisionCapabilities,
    VisionHealth,
)
from lab_api import run_video_lab_analysis


class DevelopmentDetectorAdapter:
    """VisionAdapter for uploaded-video development inference."""

    def __init__(self, *, prefer_onnx: bool = True, model_path: Path | str | None = None) -> None:
        self._prefer_onnx = prefer_onnx
        self._model_path = model_path
        self._running = False
        self._cameras: list[CameraStreamConfig] = []
        self._last_metrics: dict | None = None

    @property
    def source(self) -> AdapterSource:
        return AdapterSource.DEV

    def capabilities(self) -> VisionCapabilities:
        return VisionCapabilities(
            schema_version="1.0",
            adapter=AdapterSource.DEV,
            capabilities=("detection", "tracking", "video_file"),
            supported_classes=("person", "car", "truck", "bus", "bicycle", "motorcycle"),
            max_cameras=8,
            notes=(
                "Detector: YOLOX-Nano ONNX (Apache-2.0). Runtime: ONNX Runtime (MIT). "
                "Isolated behind VisionAdapter — swappable without Product Layer changes."
            ),
        )

    async def start(
        self,
        cameras: list[CameraStreamConfig],
        on_detection: DetectionHandler,
    ) -> None:
        self._cameras = list(cameras)
        self._running = True

        async def sink(det: dict) -> None:
            await on_detection(det)

        for cam in cameras:
            if not cam.enabled:
                continue
            path = cam.video_path or cam.rtsp_url
            if not path or not Path(path).is_file():
                continue
            collected: list[dict] = []

            def sync_sink(det: dict, _c: list = collected) -> None:
                _c.append(det)

            result = run_video_lab_analysis(
                video_path=path,
                camera_id=cam.camera_id,
                on_detection=sync_sink,
                prefer_onnx=self._prefer_onnx,
                model_path=self._model_path,
            )
            for det in collected:
                await sink(det)
            self._last_metrics = {
                "camera_id": cam.camera_id,
                "frames_processed": result.metrics.frames_processed,
                "detections_count": result.metrics.detections_count,
                "unique_tracks": result.metrics.unique_tracks,
                "average_processing_fps": result.metrics.average_processing_fps,
                "total_analysis_sec": result.metrics.total_analysis_sec,
                "detector_name": result.metrics.detector_name,
            }

    async def stop(self) -> None:
        self._running = False
        self._cameras = []

    async def health(self) -> VisionHealth:
        return VisionHealth(
            healthy=True,
            adapter=AdapterSource.DEV,
            message="development detector ready",
            active_cameras=len(self._cameras) if self._running else 0,
        )

    def last_metrics(self) -> dict | None:
        return self._last_metrics
