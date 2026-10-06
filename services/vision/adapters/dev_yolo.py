"""Dev YOLO adapter placeholder — implemented in Phase 4."""

from __future__ import annotations

from adapters.base import (
    AdapterSource,
    CameraStreamConfig,
    DetectionHandler,
    VisionCapabilities,
    VisionHealth,
)


class DevYoloAdapter:
    """PC development adapter stub. Must not import ultralytics until Phase 4."""

    @property
    def source(self) -> AdapterSource:
        return AdapterSource.DEV

    def capabilities(self) -> VisionCapabilities:
        return VisionCapabilities(
            schema_version="1.0",
            adapter=AdapterSource.DEV,
            capabilities=("detection", "tracking", "multi_camera"),
            supported_classes=("person", "car", "truck", "dog", "cat", "bicycle"),
            max_cameras=8,
            notes="Not implemented until Phase 4.",
        )

    async def start(
        self,
        cameras: list[CameraStreamConfig],
        on_detection: DetectionHandler,
    ) -> None:
        raise NotImplementedError("DevYoloAdapter is implemented in Phase 4")

    async def stop(self) -> None:
        return None

    async def health(self) -> VisionHealth:
        return VisionHealth(
            healthy=False,
            adapter=AdapterSource.DEV,
            message="not implemented (Phase 4)",
            active_cameras=0,
        )
