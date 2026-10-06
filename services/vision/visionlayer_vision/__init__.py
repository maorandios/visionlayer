"""Vision package public surface for Edge API (no vendor leakage)."""

from adapters.base import AdapterSource, VisionAdapter
from detectors import DevelopmentDetectorAdapter, ObjectDetector, RawDetection, ScriptedDetector
from pipeline import AnalysisMetrics, AnalysisResult, analyze_video
from sources import (
    MAX_DURATION_SEC,
    CameraSource,
    MockSource,
    UploadedVideoSource,
    VideoMetadata,
    VideoValidationError,
    probe_video,
    validate_upload,
)
from trackers import ByteTrackAdapter, IoUTracker, TrackerConfig

__all__ = [
    "MAX_DURATION_SEC",
    "AdapterSource",
    "AnalysisMetrics",
    "AnalysisResult",
    "ByteTrackAdapter",
    "CameraSource",
    "DevelopmentDetectorAdapter",
    "IoUTracker",
    "MockSource",
    "ObjectDetector",
    "RawDetection",
    "ScriptedDetector",
    "TrackerConfig",
    "UploadedVideoSource",
    "VideoMetadata",
    "VideoValidationError",
    "VisionAdapter",
    "analyze_video",
    "probe_video",
    "validate_upload",
]
