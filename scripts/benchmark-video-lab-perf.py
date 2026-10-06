"""Benchmark Video Lab performance configs (dev CPU).

Compares frame stride / model variants when ONNX models are available.
Always runs a scripted baseline for stride behavior.

Usage (from repo root, vision venv):

  cd services/vision
  .\\.venv\\Scripts\\python.exe ..\\..\\scripts\\benchmark-video-lab-perf.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VISION = ROOT / "services" / "vision"
sys.path.insert(0, str(VISION))

from lab_api import create_detector, create_tracker, get_vision_runtime_config  # noqa: E402
from pipeline.video_analyzer import analyze_video  # noqa: E402
from sources.uploaded_video import MockSource, UploadedVideoSource  # noqa: E402


def _pick_video() -> Path | None:
    videos = ROOT / "data" / "test-videos"
    if not videos.is_dir():
        return None
    for p in sorted(videos.glob("*.mp4")):
        return p
    return None


def _run(
    *,
    label: str,
    source,
    detector,
    frame_stride: int,
) -> dict:
    tracker = create_tracker(kind="bytetrack", frame_rate=10.0)
    t0 = time.perf_counter()
    result = analyze_video(
        source,
        detector,
        tracker=tracker,
        camera_id="bench",
        base_unix_ts=1_700_000_000.0,
        source_label="development_video",
        frame_stride=frame_stride,
    )
    wall = time.perf_counter() - t0
    m = result.metrics
    return {
        "label": label,
        "total_analysis_sec": round(wall, 3),
        "detector_calls": m.frames_analyzed_by_detector,
        "frames_read": m.frames_read,
        "processing_fps": round(m.average_processing_fps, 2),
        "unique_tracks": m.unique_tracks,
        "detections": m.detections_count,
        "frame_stride": m.frame_stride,
        "detector_name": m.detector_name,
        "model_path": m.model_path,
        "runtime_config": m.runtime_config,
        "gallery_cards": len(result.track_gallery),
    }


def main() -> int:
    runtime = get_vision_runtime_config()
    rows: list[dict] = []

    # Synthetic baseline — always available
    mock = MockSource(camera_id="bench", fps=10.0, frame_count=60, moving_box=True)
    for stride in (1, 2, 3):
        rows.append(
            _run(
                label=f"scripted stride={stride}",
                source=mock,
                detector=create_detector(prefer_onnx=False),
                frame_stride=stride,
            )
        )

    video = _pick_video()
    models = ROOT / "data" / "models"
    configs = [
        ("yolox_m", 1),
        ("yolox_s", 2),
        ("yolox_s", 3),
    ]
    if video is not None:
        source = UploadedVideoSource(camera_id="bench", path=video)
        for model_base, stride in configs:
            path = models / f"{model_base}.onnx"
            if not path.is_file():
                rows.append(
                    {
                        "label": f"{model_base} stride={stride}",
                        "skipped": True,
                        "reason": f"missing {path.name}",
                    }
                )
                continue
            try:
                det = create_detector(prefer_onnx=True, model_path=path)
                rows.append(
                    _run(
                        label=f"{model_base} stride={stride}",
                        source=source,
                        detector=det,
                        frame_stride=stride,
                    )
                )
            except Exception as exc:
                rows.append(
                    {
                        "label": f"{model_base} stride={stride}",
                        "skipped": True,
                        "reason": str(exc),
                    }
                )
    else:
        rows.append({"label": "onnx_video", "skipped": True, "reason": "no data/test-videos/*.mp4"})

    recommendation = {
        "preferred_model": runtime.preferred_model,
        "frame_stride": runtime.frame_stride,
        "onnx_intra_op_num_threads": runtime.onnx_intra_op_num_threads,
        "onnx_inter_op_num_threads": runtime.onnx_inter_op_num_threads,
        "opencv_num_threads": runtime.opencv_num_threads,
        "rationale": (
            "Default development config favors yolox_s + stride=2 + limited ORT/OpenCV "
            "threads so the host PC stays responsive while detection quality remains usable."
        ),
    }

    out = {
        "recommendation": recommendation,
        "results": rows,
    }
    out_path = ROOT / "docs" / "phases" / "video-lab-perf-benchmark.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\nWrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
