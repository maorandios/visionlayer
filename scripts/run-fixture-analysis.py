"""End-to-end fixture analysis with ONNX if available — prints performance metrics."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "vision"))

from lab_api import run_video_lab_analysis  # noqa: E402


def write_clip(path: Path, frames: int = 60, fps: float = 15.0) -> None:
    w, h = 640, 360
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for i in range(frames):
        img = np.full((h, w, 3), 40, dtype=np.uint8)
        x1 = 80 + i * 4
        cv2.rectangle(img, (x1, 100), (x1 + 80, 280), (0, 255, 0), -1)
        writer.write(img)
    writer.release()


def main() -> None:
    model = ROOT / "data" / "models" / "yolox_nano.onnx"
    with tempfile.TemporaryDirectory() as tmp:
        clip = Path(tmp) / "fixture.mp4"
        write_clip(clip)
        # ONNX path (street-like scoring later); synthetic green may yield 0 boxes
        onnx_result = run_video_lab_analysis(
            video_path=clip,
            camera_id="bench_cam_onnx",
            prefer_onnx=True,
            model_path=model if model.is_file() else None,
        )
        scripted = run_video_lab_analysis(
            video_path=clip,
            camera_id="bench_cam_scripted",
            prefer_onnx=False,
        )
    m = onnx_result.metrics
    print("detector_onnx:", m.detector_name)
    print("onnx_present:", model.is_file())
    print("onnx_frames:", m.frames_processed)
    print("onnx_detections:", m.detections_count)
    print("onnx_avg_processing_fps:", round(m.average_processing_fps, 2))
    print("onnx_detector_ms_avg:", round(m.detector_inference_ms_avg, 2))
    print("onnx_total_analysis_sec:", round(m.total_analysis_sec, 2))
    print("scripted_detections:", scripted.metrics.detections_count)
    print("scripted_unique_tracks:", scripted.metrics.unique_tracks)
    print("scripted_avg_processing_fps:", round(scripted.metrics.average_processing_fps, 2))
    print("E2E_ANALYSIS_OK")


if __name__ == "__main__":
    main()
