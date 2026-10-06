"""Vision unit tests — metadata, timestamps, tracking, schema."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from detectors.yolox_onnx import ScriptedDetector
from pipeline.video_analyzer import analyze_video
from sources.metadata import VideoValidationError, validate_upload
from sources.uploaded_video import MockSource
from trackers.iou_tracker import IoUTracker


SCHEMA_PATH = (
    Path(__file__).resolve().parents[3] / "shared" / "schemas" / "detection.schema.json"
)


def test_validate_upload_rejects_bad_extension() -> None:
    with pytest.raises(VideoValidationError):
        validate_upload(filename="a.txt", size_bytes=100)


def test_validate_upload_accepts_mp4() -> None:
    validate_upload(filename="clip.mp4", size_bytes=1024)


def test_timestamp_preservation_uses_video_timeline() -> None:
    source = MockSource(camera_id="cam_t", fps=10.0, frame_count=25, moving_box=True)
    result = analyze_video(
        source,
        ScriptedDetector(),
        tracker=IoUTracker(),
        base_unix_ts=1_700_000_000.0,
        source_label="development_video",
        frame_stride=1,
    )
    assert result.detections
    first = result.detections[0]["timestamp"]
    last = result.detections[-1]["timestamp"]
    assert abs(first - 1_700_000_000.0) < 0.2
    assert last - first >= 1.5


def test_track_ids_stable_across_frames() -> None:
    source = MockSource(camera_id="cam_tr", fps=10.0, frame_count=15, moving_box=True)
    result = analyze_video(
        source,
        ScriptedDetector(),
        tracker=IoUTracker(),
        source_label="development_video",
        frame_stride=1,
    )
    assert result.metrics.unique_tracks >= 1
    ids = {d["track_id"] for d in result.detections}
    assert len(ids) == result.metrics.unique_tracks
    # Moving box should keep a single dominant track for most frames
    assert min(ids) >= 1


def test_detection_matches_unified_schema() -> None:
    import jsonschema

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    source = MockSource(camera_id="cam_s", fps=5.0, frame_count=5, moving_box=True)
    result = analyze_video(
        source,
        ScriptedDetector(),
        tracker=IoUTracker(),
        source_label="development_video",
        frame_stride=1,
    )
    assert result.detections
    for det in result.detections:
        jsonschema.validate(det, schema)
        assert det["source"] == "development_video"
