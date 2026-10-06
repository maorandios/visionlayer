"""VisionAdapter contract — hardware-agnostic interface for all vision backends.

Product Layer (edge-api) must never import DeepStream, TensorRT, HailoRT, or CUDA.
Only adapters under services/vision may touch hardware SDKs (Phase 11).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol, runtime_checkable


@dataclass(frozen=True, slots=True)
class CameraStreamConfig:
    """Minimal stream config passed to a VisionAdapter. No product-domain fields."""

    camera_id: str
    rtsp_url: str = ""
    video_path: str | None = None
    enabled: bool = True


class AdapterSource(str, Enum):
    MOCK = "mock"
    DEV = "dev"
    DEVELOPMENT_VIDEO = "development_video"
    DEEPSTREAM = "deepstream"
    HAILO = "hailo"

@dataclass(frozen=True, slots=True)
class VisionHealth:
    healthy: bool
    adapter: AdapterSource
    message: str = ""
    active_cameras: int = 0


@dataclass(frozen=True, slots=True)
class VisionCapabilities:
    """Mirrors shared/schemas/vision_capabilities.schema.json."""

    schema_version: str
    adapter: AdapterSource
    capabilities: tuple[str, ...]
    supported_classes: tuple[str, ...]
    max_cameras: int | None = None
    notes: str | None = None


DetectionHandler = Callable[[dict], Awaitable[None]]


@runtime_checkable
class VisionAdapter(Protocol):
    """Every vision backend implements this protocol and emits unified detection dicts."""

    @property
    def source(self) -> AdapterSource: ...

    def capabilities(self) -> VisionCapabilities: ...

    async def start(
        self,
        cameras: list[CameraStreamConfig],
        on_detection: DetectionHandler,
    ) -> None: ...

    async def stop(self) -> None: ...

    async def health(self) -> VisionHealth: ...


@dataclass(slots=True)
class AdapterRegistry:
    """Maps adapter names to factory callables. Used by the vision process entrypoint."""

    _factories: dict[str, Callable[[], VisionAdapter]] = field(default_factory=dict)

    def register(self, name: str, factory: Callable[[], VisionAdapter]) -> None:
        self._factories[name] = factory

    def create(self, name: str) -> VisionAdapter:
        try:
            return self._factories[name]()
        except KeyError as exc:
            known = ", ".join(sorted(self._factories)) or "(none)"
            raise KeyError(f"Unknown vision adapter '{name}'. Registered: {known}") from exc

    def names(self) -> list[str]:
        return sorted(self._factories)
