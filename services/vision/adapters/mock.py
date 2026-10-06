"""Mock VisionAdapter placeholder — no real inference (Phase 0 stub).

Real fake-detection streaming arrives in Phase 1.
"""

from __future__ import annotations

from adapters.base import (
    AdapterSource,
    CameraStreamConfig,
    DetectionHandler,
    VisionCapabilities,
    VisionHealth,
)


class MockVisionAdapter:
    """Development stub that satisfies VisionAdapter without hardware SDKs."""

    def __init__(self) -> None:
        self._running = False
        self._cameras: list[CameraStreamConfig] = []
        self._on_detection: DetectionHandler | None = None

    @property
    def source(self) -> AdapterSource:
        return AdapterSource.MOCK

    def capabilities(self) -> VisionCapabilities:
        return VisionCapabilities(
            schema_version="1.0",
            adapter=AdapterSource.MOCK,
            capabilities=("detection", "tracking"),
            supported_classes=("person", "car", "truck", "dog", "cat", "bicycle"),
            max_cameras=16,
            notes="Phase 0 placeholder. Simulation API lands in Phase 1.",
        )

    async def start(
        self,
        cameras: list[CameraStreamConfig],
        on_detection: DetectionHandler,
    ) -> None:
        self._cameras = list(cameras)
        self._on_detection = on_detection
        self._running = True

    async def stop(self) -> None:
        self._running = False
        self._on_detection = None
        self._cameras = []

    async def health(self) -> VisionHealth:
        return VisionHealth(
            healthy=True,
            adapter=AdapterSource.MOCK,
            message="mock adapter idle (Phase 0)",
            active_cameras=len(self._cameras) if self._running else 0,
        )
