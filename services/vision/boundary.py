"""OFFICIAL Vision boundary for the Product Layer (edge-api).

Product code must import vision **only** through this module (or ``lab_api``
re-exports that forward here). Do not import detectors, trackers, ONNX, or
cv2 inference paths from edge-api domain code.

Current development backend: YOLOX ONNX + ByteTrack (encapsulated).
Future backends (DeepStream / Hailo) must emit the same Unified Detection
contract — see ``detection_contract.py`` and ``adapters/deepstream/``.

Continuous RTSP streaming is intentionally not implemented yet; the API surface
reserves health/capabilities and documents stream analysis for Phase 3+.
"""

from __future__ import annotations

from collections.abc import Callable, Collection
from pathlib import Path
from typing import Any

from detection_contract import (
    ALLOWED_SOURCES,
    CANONICAL_CLASSES,
    DETECTION_SCHEMA_VERSION,
    DetectionContractError,
    build_detection,
    validate_detection,
    validate_detections,
)

# Development backend (YOLOX + ByteTrack) — implementation detail.
from lab_api import run_video_lab_analysis as _dev_analyze
from pipeline.video_analyzer import AnalysisResult
from runtime_config import get_vision_runtime_config, resolve_model_order
from sources.metadata import VideoValidationError, probe_video, validate_upload


def vision_capabilities() -> dict[str, Any]:
    """Advertise what the active vision stack can do (no hardware SDKs)."""
    return {
        "schema_version": "1.0",
        "boundary": "services.vision.boundary",
        "active_backend": "development",
        "backends": {
            "development": {
                "implemented": True,
                "detector": "yolox_onnx",
                "tracker": "bytetrack",
                "modes": ["uploaded_video"],
            },
            "deepstream": {
                "implemented": False,
                "modes": ["uploaded_video", "rtsp"],
                "notes": "Placeholder — must emit Unified Detection contract only.",
            },
            "hailo": {
                "implemented": False,
                "modes": ["rtsp"],
            },
            "mock": {
                "implemented": True,
                "modes": ["synthetic"],
            },
        },
        "supported_classes": sorted(CANONICAL_CLASSES),
        "detection_schema_version": DETECTION_SCHEMA_VERSION,
        "allowed_sources": sorted(ALLOWED_SOURCES),
        "continuous_stream": False,
        "notes": (
            "AI Test / Video Lab use analyze_uploaded_video(). "
            "Continuous RTSP will use a future start_stream()/stop_stream() API "
            "on this same boundary without changing Product Logic."
        ),
    }


def vision_health() -> dict[str, Any]:
    """Lightweight health for the vision package (no GPU probe in POC)."""
    runtime = get_vision_runtime_config()
    return {
        "healthy": True,
        "boundary": "services.vision.boundary",
        "active_backend": "development",
        "continuous_stream": False,
        "runtime": runtime.to_dict() if hasattr(runtime, "to_dict") else {},
        "message": "development backend available via analyze_uploaded_video",
    }


def analyze_uploaded_video(
    *,
    video_path: Path | str,
    camera_id: str,
    on_detection: Callable[[dict[str, Any]], None] | None = None,
    on_progress: Callable[[int, int, str], None] | None = None,
    prefer_onnx: bool = True,
    model_path: Path | str | None = None,
    base_unix_ts: float | None = None,
    frame_stride: int | None = None,
    target_classes: Collection[str] | None = None,
    conf_threshold: float | None = None,
    score_threshold: float | None = None,
    uniform_threshold: bool = False,
    validate: bool = True,
) -> AnalysisResult:
    """Official finite-video / AI Test analysis entrypoint.

    Returns ``AnalysisResult`` whose ``detections`` conform to the Unified
    Detection contract. Backend internals (YOLOX, ByteTrack) stay private.
    """
    result = _dev_analyze(
        video_path=video_path,
        camera_id=camera_id,
        on_detection=on_detection,
        on_progress=on_progress,
        prefer_onnx=prefer_onnx,
        model_path=model_path,
        base_unix_ts=base_unix_ts,
        frame_stride=frame_stride,
        target_classes=target_classes,
        conf_threshold=conf_threshold,
        score_threshold=score_threshold,
        uniform_threshold=uniform_threshold,
    )
    if validate and result.detections:
        validate_detections(result.detections)
    return result


def analyze_detections_batch(
    detections: list[dict[str, Any]],
    *,
    validate: bool = True,
) -> list[dict[str, Any]]:
    """Pass-through for FakeVisionBackend / tests — validates contract only."""
    if validate:
        validate_detections(detections)
    return list(detections)


__all__ = [
    "ALLOWED_SOURCES",
    "CANONICAL_CLASSES",
    "AnalysisResult",
    "DetectionContractError",
    "VideoValidationError",
    "analyze_detections_batch",
    "analyze_uploaded_video",
    "build_detection",
    "get_vision_runtime_config",
    "probe_video",
    "resolve_model_order",
    "validate_detection",
    "validate_detections",
    "validate_upload",
    "vision_capabilities",
    "vision_health",
]
