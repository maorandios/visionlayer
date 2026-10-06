"""Single public entry for Video Test Lab — Product Layer imports only this module."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Collection, Literal

from detectors.yolox_onnx import PRIMARY_CLASSES, ScriptedDetector, YoloxOnnxDetector
from pipeline.video_analyzer import AnalysisResult, analyze_video
from runtime_config import (
    apply_opencv_thread_limit,
    get_vision_runtime_config,
    resolve_model_order,
)
from sources.metadata import VideoValidationError, probe_video, validate_upload
from sources.uploaded_video import UploadedVideoSource
from trackers.bytetrack_adapter import ByteTrackAdapter
from trackers.config import DEFAULT_TRACKER_CONFIG, TrackerConfig
from trackers.iou_tracker import IoUTracker

TrackerKind = Literal["bytetrack", "iou"]


def create_detector(
    *,
    prefer_onnx: bool = True,
    model_path: Path | str | None = None,
    target_classes: Collection[str] | None = None,
):
    """Build detector: ONNX YOLOX when available, else scripted (tests/dev fallback)."""
    apply_opencv_thread_limit()
    class_filter = None
    if target_classes:
        class_filter = frozenset(str(c) for c in target_classes) & PRIMARY_CLASSES
        if not class_filter:
            class_filter = PRIMARY_CLASSES
    if prefer_onnx:
        try:
            path = Path(model_path) if model_path else None
            return YoloxOnnxDetector(path, class_filter=class_filter)
        except Exception:
            pass
    return ScriptedDetector()


def create_tracker(
    *,
    kind: TrackerKind = "bytetrack",
    frame_rate: float | None = None,
    config: TrackerConfig | None = None,
):
    """Factory: ByteTrack is the Video Test Lab default; IoU remains a debug fallback."""
    cfg = config or DEFAULT_TRACKER_CONFIG
    fps = frame_rate if frame_rate and frame_rate > 0 else cfg.default_fps
    if kind == "iou":
        return IoUTracker()
    return ByteTrackAdapter(config=cfg, frame_rate=fps)


def run_video_lab_analysis(
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
    tracker_kind: TrackerKind = "bytetrack",
    tracker_config: TrackerConfig | None = None,
) -> AnalysisResult:
    apply_opencv_thread_limit()
    runtime = get_vision_runtime_config()
    source = UploadedVideoSource(camera_id=camera_id, path=Path(video_path))
    meta = source.metadata()
    fps = float(meta.fps) if meta.fps and meta.fps > 0 else DEFAULT_TRACKER_CONFIG.default_fps
    stride = max(1, int(frame_stride if frame_stride is not None else runtime.frame_stride))
    detector = create_detector(
        prefer_onnx=prefer_onnx,
        model_path=model_path,
        target_classes=target_classes,
    )
    tracker = create_tracker(
        kind=tracker_kind,
        frame_rate=max(1.0, fps / float(stride)),
        config=tracker_config,
    )
    return analyze_video(
        source,
        detector,
        tracker=tracker,
        camera_id=camera_id,
        base_unix_ts=base_unix_ts,
        source_label="development_video",
        on_detection=on_detection,
        on_progress=on_progress,
        frame_stride=stride,
        tracker_config=tracker_config,
    )


__all__ = [
    "AnalysisResult",
    "TrackerConfig",
    "VideoValidationError",
    "create_detector",
    "create_tracker",
    "get_vision_runtime_config",
    "probe_video",
    "resolve_model_order",
    "run_video_lab_analysis",
    "validate_upload",
]
