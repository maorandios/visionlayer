"""Video analysis pipeline: frames → detect → track → unified Detection dicts.

Uses VIDEO timestamps (not wall-clock) so duration rules stay correct.
"""

from __future__ import annotations

import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable

from detectors.base import ObjectDetector
from pipeline.track_results import build_track_gallery, fragmentation_hints
from runtime_config import apply_opencv_thread_limit, get_vision_runtime_config
from sources.base import CameraSource
from trackers.base import Tracker
from trackers.bytetrack_adapter import ByteTrackAdapter
from trackers.config import DEFAULT_TRACKER_CONFIG, TrackerConfig


DetectionSink = Callable[[dict[str, Any]], None]
ProgressSink = Callable[[int, int, str], None]


@dataclass
class AnalysisMetrics:
    video_duration_sec: float = 0.0
    frames_read: int = 0
    frames_processed: int = 0
    frames_analyzed_by_detector: int = 0
    frame_stride: int = 1
    average_processing_fps: float = 0.0
    detector_inference_ms_total: float = 0.0
    detector_inference_ms_avg: float = 0.0
    total_analysis_sec: float = 0.0
    detections_count: int = 0
    unique_tracks: int = 0
    class_counts: dict[str, int] = field(default_factory=dict)
    unique_tracks_by_class: dict[str, int] = field(default_factory=dict)
    events_created: int = 0
    detector_name: str = ""
    tracker_name: str = "bytetrack"
    tracking_diagnostics: dict[str, Any] = field(default_factory=dict)
    runtime_config: dict[str, Any] = field(default_factory=dict)
    model_path: str | None = None


@dataclass
class OverlayFrame:
    frame_index: int
    timestamp_sec: float
    boxes: list[dict[str, Any]]


@dataclass
class TimelineItem:
    timestamp_sec: float
    kind: str
    label: str


@dataclass
class BestDetection:
    """Highest-confidence sighting for a class (legacy summary helper)."""

    class_name: str
    confidence: float
    timestamp_sec: float
    frame_index: int
    track_id: int
    bbox: list[float]


@dataclass
class AnalysisResult:
    detections: list[dict[str, Any]]
    metrics: AnalysisMetrics
    overlays: list[OverlayFrame]
    timeline: list[TimelineItem]
    base_unix_ts: float
    best_by_class: dict[str, BestDetection] = field(default_factory=dict)
    track_gallery: list[dict[str, Any]] = field(default_factory=list)
    fragmentation_hints: list[dict[str, Any]] = field(default_factory=list)


def analyze_video(
    source: CameraSource,
    detector: ObjectDetector,
    *,
    tracker: Tracker | None = None,
    camera_id: str | None = None,
    base_unix_ts: float | None = None,
    source_label: str = "development_video",
    on_detection: DetectionSink | None = None,
    on_progress: ProgressSink | None = None,
    frame_stride: int | None = None,
    tracker_config: TrackerConfig | None = None,
) -> AnalysisResult:
    """Process an entire video as fast as practical while preserving video timestamps."""
    runtime = get_vision_runtime_config()
    apply_opencv_thread_limit(runtime)
    stride = max(1, int(frame_stride if frame_stride is not None else runtime.frame_stride))

    meta = source.metadata()
    fps = float(meta.fps) if meta.fps and meta.fps > 0 else DEFAULT_TRACKER_CONFIG.default_fps
    # Effective FPS seen by tracker ≈ source_fps / stride
    tracker_fps = max(1.0, fps / float(stride))
    if tracker is None:
        tracker = ByteTrackAdapter(
            config=tracker_config or DEFAULT_TRACKER_CONFIG,
            frame_rate=tracker_fps,
        )
    tracker.reset()
    cam_id = camera_id or source.camera_id
    base = float(base_unix_ts if base_unix_ts is not None else time.time())
    total_est = max(1, int(meta.frame_count or max(1, int(meta.duration_sec * fps))))
    analyzed_est = max(1, (total_est + stride - 1) // stride)

    detections: list[dict[str, Any]] = []
    gallery_obs: list[dict[str, Any]] = []
    overlays: list[OverlayFrame] = []
    timeline: list[TimelineItem] = []
    class_counter: Counter[str] = Counter()
    tracks_by_class: dict[str, set[int]] = {}
    track_ids: set[int] = set()
    best_by_class: dict[str, BestDetection] = {}
    infer_ms_total = 0.0
    frames_read = 0
    frames_analyzed = 0

    model_path = getattr(detector, "model_path", None)
    model_path_str = str(model_path) if model_path is not None else None

    if on_progress is not None:
        on_progress(0, analyzed_est, "מתחיל ניתוח…")

    wall_start = time.perf_counter()
    for packet in source.frames():
        frames_read += 1
        if stride > 1 and packet.frame_index % stride != 0:
            continue
        t0 = time.perf_counter()
        raw = detector.detect(packet.image_bgr)
        infer_ms_total += (time.perf_counter() - t0) * 1000.0
        frames_analyzed += 1
        tracked = tracker.update(
            raw,
            frame_size=(int(packet.width), int(packet.height)),
            timestamp=float(packet.timestamp_sec),
        )

        frame_boxes: list[dict[str, Any]] = []
        for tr in tracked:
            track_ids.add(tr.track_id)
            class_counter[tr.class_name] += 1
            tracks_by_class.setdefault(tr.class_name, set()).add(tr.track_id)
            # CRITICAL: video timeline, not wall clock
            ts = base + float(packet.timestamp_sec)
            det = {
                "type": "detection",
                "schema_version": "1.0",
                "camera_id": cam_id,
                "class": tr.class_name,
                "confidence": round(float(tr.confidence), 4),
                "bbox": [float(x) for x in tr.bbox],
                "track_id": int(tr.track_id),
                "timestamp": ts,
                "frame_size": [int(packet.width), int(packet.height)],
                "source": source_label,
            }
            detections.append(det)
            # Gallery observations are UI-only — not part of Detection contract
            gallery_obs.append(
                {
                    **det,
                    "frame_index": int(packet.frame_index),
                }
            )
            if on_detection is not None:
                on_detection(det)
            frame_boxes.append(
                {
                    "track_id": tr.track_id,
                    "class": tr.class_name,
                    "confidence": tr.confidence,
                    "bbox": list(tr.bbox),
                }
            )
            timeline.append(
                TimelineItem(
                    timestamp_sec=float(packet.timestamp_sec),
                    kind="detection",
                    label=f"{tr.class_name} #{tr.track_id}",
                )
            )
            prev = best_by_class.get(tr.class_name)
            if prev is None or float(tr.confidence) > prev.confidence:
                best_by_class[tr.class_name] = BestDetection(
                    class_name=tr.class_name,
                    confidence=float(tr.confidence),
                    timestamp_sec=float(packet.timestamp_sec),
                    frame_index=int(packet.frame_index),
                    track_id=int(tr.track_id),
                    bbox=[float(x) for x in tr.bbox],
                )
        overlays.append(
            OverlayFrame(
                frame_index=packet.frame_index,
                timestamp_sec=packet.timestamp_sec,
                boxes=frame_boxes,
            )
        )
        if on_progress is not None and (frames_analyzed == 1 or frames_analyzed % 3 == 0):
            on_progress(min(frames_analyzed, analyzed_est), analyzed_est, "מזהה אובייקטים…")

    if on_progress is not None:
        on_progress(analyzed_est, analyzed_est, "מסיים ניתוח…")

    wall_elapsed = max(1e-6, time.perf_counter() - wall_start)
    diag_fn = getattr(tracker, "diagnostics", None)
    tracking_diagnostics = diag_fn() if callable(diag_fn) else {}
    tracker_name = getattr(tracker, "name", "unknown")
    gallery = build_track_gallery(gallery_obs, base_unix_ts=base)
    hints = fragmentation_hints(gallery)

    metrics = AnalysisMetrics(
        video_duration_sec=float(meta.duration_sec),
        frames_read=frames_read,
        frames_processed=frames_analyzed,
        frames_analyzed_by_detector=frames_analyzed,
        frame_stride=stride,
        average_processing_fps=frames_analyzed / wall_elapsed,
        detector_inference_ms_total=infer_ms_total,
        detector_inference_ms_avg=(infer_ms_total / frames_analyzed) if frames_analyzed else 0.0,
        total_analysis_sec=wall_elapsed,
        detections_count=len(detections),
        unique_tracks=len(track_ids),
        class_counts=dict(class_counter),
        unique_tracks_by_class={k: len(v) for k, v in tracks_by_class.items()},
        detector_name=detector.name,
        tracker_name=str(tracker_name),
        tracking_diagnostics=tracking_diagnostics,
        runtime_config=runtime.to_dict(),
        model_path=model_path_str,
    )
    return AnalysisResult(
        detections=detections,
        metrics=metrics,
        overlays=overlays,
        timeline=timeline,
        base_unix_ts=base,
        best_by_class=best_by_class,
        track_gallery=gallery,
        fragmentation_hints=hints,
    )
