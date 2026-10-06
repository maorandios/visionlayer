"""Unique-track gallery, frame stride, ORT threads, duration+stride."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from detectors.yolox_onnx import ScriptedDetector
from pipeline.track_results import _Obs, build_track_gallery, score_observation
from pipeline.video_analyzer import analyze_video
from runtime_config import clear_vision_runtime_config_cache, get_vision_runtime_config
from sources.uploaded_video import MockSource
from trackers.bytetrack_adapter import ByteTrackAdapter
from trackers.iou_tracker import IoUTracker


def _det(
    *,
    track_id: int,
    cls: str,
    confidence: float,
    timestamp: float,
    frame_index: int,
    bbox: list[float],
    frame_size: list[int] | None = None,
) -> dict:
    return {
        "type": "detection",
        "schema_version": "1.0",
        "camera_id": "c1",
        "class": cls,
        "confidence": confidence,
        "bbox": bbox,
        "track_id": track_id,
        "timestamp": timestamp,
        "frame_index": frame_index,
        "frame_size": frame_size or [640, 480],
        "source": "development_video",
    }


def test_unique_track_gallery_one_card_for_same_track() -> None:
    base = 1_700_000_000.0
    dets = [
        _det(
            track_id=7,
            cls="motorcycle",
            confidence=0.7 + i * 0.005,
            timestamp=base + i * 0.1,
            frame_index=i,
            bbox=[100 + i, 80, 220 + i, 200],
        )
        for i in range(30)
    ]
    gallery = build_track_gallery(dets, base_unix_ts=base)
    assert len(gallery) == 1
    assert gallery[0]["track_id"] == 7
    assert gallery[0]["class"] == "motorcycle"
    assert gallery[0]["observations"] == 30


def test_unique_track_gallery_seven_motorcycles() -> None:
    base = 1_700_000_000.0
    dets = []
    for tid in range(1, 8):
        for i in range(5):
            dets.append(
                _det(
                    track_id=tid,
                    cls="motorcycle",
                    confidence=0.8,
                    timestamp=base + tid + i * 0.1,
                    frame_index=tid * 10 + i,
                    bbox=[tid * 40, 50, tid * 40 + 60, 160],
                )
            )
    gallery = build_track_gallery(dets, base_unix_ts=base)
    assert len(gallery) == 7
    assert {c["track_id"] for c in gallery} == set(range(1, 8))


def test_representative_frame_prefers_high_quality() -> None:
    base = 0.0
    dets = [
        _det(
            track_id=1,
            cls="person",
            confidence=0.5,
            timestamp=1.0,
            frame_index=1,
            bbox=[0, 0, 20, 20],
        ),
        _det(
            track_id=1,
            cls="person",
            confidence=0.92,
            timestamp=2.0,
            frame_index=10,
            bbox=[120, 80, 320, 360],
        ),
        _det(
            track_id=1,
            cls="person",
            confidence=0.6,
            timestamp=3.0,
            frame_index=20,
            bbox=[10, 10, 40, 40],
        ),
    ]
    gallery = build_track_gallery(dets, base_unix_ts=base)
    assert len(gallery) == 1
    assert gallery[0]["frame_index"] == 10
    assert gallery[0]["confidence"] == pytest.approx(0.92)
    assert gallery[0]["representative_timestamp"] == pytest.approx(2.0)


def test_frame_stride_reduces_detector_calls() -> None:
    source = MockSource(camera_id="cam_s", fps=10.0, frame_count=30, moving_box=True)
    calls = {"n": 0}

    class CountingDetector(ScriptedDetector):
        def detect(self, image_bgr: np.ndarray):
            calls["n"] += 1
            return super().detect(image_bgr)

    result = analyze_video(
        source,
        CountingDetector(),
        tracker=IoUTracker(),
        frame_stride=3,
        source_label="development_video",
        base_unix_ts=1_700_000_000.0,
    )
    assert result.metrics.frame_stride == 3
    assert result.metrics.frames_read == 30
    assert result.metrics.frames_analyzed_by_detector == calls["n"]
    assert calls["n"] == 10
    assert result.detections
    ts0 = result.detections[0]["timestamp"] - 1_700_000_000.0
    assert ts0 == pytest.approx(0.0, abs=0.15)


def test_duration_uses_video_time_with_stride() -> None:
    source = MockSource(camera_id="cam_d", fps=10.0, frame_count=25, moving_box=True)
    result = analyze_video(
        source,
        ScriptedDetector(),
        tracker=ByteTrackAdapter(frame_rate=5.0),
        frame_stride=2,
        source_label="development_video",
        base_unix_ts=1_700_000_000.0,
    )
    assert result.detections
    first = min(d["timestamp"] for d in result.detections) - 1_700_000_000.0
    last = max(d["timestamp"] for d in result.detections) - 1_700_000_000.0
    assert (last - first) >= 1.5


def test_onnx_runtime_receives_configured_threads(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VISION_ONNX_INTRA_OP_THREADS", "3")
    monkeypatch.setenv("VISION_ONNX_INTER_OP_THREADS", "2")
    clear_vision_runtime_config_cache()
    cfg = get_vision_runtime_config()
    assert cfg.onnx_intra_op_num_threads == 3
    assert cfg.onnx_inter_op_num_threads == 2

    captured: dict[str, int] = {}

    class FakeOpts:
        graph_optimization_level = None
        intra_op_num_threads = 0
        inter_op_num_threads = 0

    class FakeSession:
        def __init__(self, path, sess_options=None, providers=None):
            captured["intra"] = sess_options.intra_op_num_threads
            captured["inter"] = sess_options.inter_op_num_threads

        def get_inputs(self):
            inp = MagicMock()
            inp.shape = [1, 3, 640, 640]
            inp.name = "images"
            return [inp]

    fake_ort = MagicMock()
    fake_ort.SessionOptions = FakeOpts
    fake_ort.GraphOptimizationLevel.ORT_ENABLE_ALL = 99
    fake_ort.InferenceSession = FakeSession

    model = Path(__file__).resolve().parents[3] / "data" / "models" / "yolox_s.onnx"
    if not model.is_file():
        model = Path(__file__).resolve().parents[3] / "data" / "models" / "yolox_m.onnx"
    if not model.is_file():
        pytest.skip("ONNX model not present for ORT thread wiring test")

    with patch.dict("sys.modules", {"onnxruntime": fake_ort}):
        from detectors.yolox_onnx import YoloxOnnxDetector

        det = YoloxOnnxDetector.__new__(YoloxOnnxDetector)
        det._model_path = model
        det._input_size = (640, 640)
        det._conf = 0.3
        det._nms = 0.45
        det._score = 0.1
        det._with_p6 = False
        det._class_filter = frozenset({"person"})
        det._session = None
        det._load()
        assert captured["intra"] == 3
        assert captured["inter"] == 2

    clear_vision_runtime_config_cache()


def test_score_observation_deterministic() -> None:
    a = _Obs(0.9, 1.0, 1, [100, 100, 300, 300], 640, 480)
    b = _Obs(0.4, 1.0, 1, [0, 0, 10, 10], 640, 480)
    assert score_observation(a) > score_observation(b)
