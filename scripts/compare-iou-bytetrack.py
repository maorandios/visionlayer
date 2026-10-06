"""Compare IoU vs ByteTrack on a synthetic fixture (no YOLOX required)."""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VISION = ROOT / "services" / "vision"
sys.path.insert(0, str(VISION))

import cv2
import numpy as np

from lab_api import run_video_lab_analysis


def _write_fixture(path: Path, *, frames: int = 40, fps: float = 10.0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 320, 240
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(path), fourcc, fps, (w, h))
    assert writer.isOpened()
    for i in range(frames):
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:] = (30, 30, 30)
        # moving green person-like box (scripted detector)
        x1 = 40 + i * 3
        y1 = 50
        x2 = x1 + 50
        y2 = y1 + 110
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), -1)
        writer.write(img)
    writer.release()


def _run(path: Path, kind: str) -> dict:
    t0 = time.perf_counter()
    result = run_video_lab_analysis(
        video_path=path,
        camera_id="cmp_cam",
        prefer_onnx=False,  # scripted green-box detector
        tracker_kind=kind,  # type: ignore[arg-type]
    )
    elapsed = time.perf_counter() - t0
    ids = [d["track_id"] for d in result.detections]
    switches = sum(1 for a, b in zip(ids, ids[1:]) if a != b)
    return {
        "tracker": kind,
        "unique_tracks": result.metrics.unique_tracks,
        "detections": result.metrics.detections_count,
        "id_value_changes_along_timeline": switches,
        "processing_fps": round(result.metrics.average_processing_fps, 2),
        "wall_sec": round(elapsed, 3),
        "tracker_name": result.metrics.tracker_name,
        "diagnostics": result.metrics.tracking_diagnostics,
    }


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "data" / "test-videos" / "_cmp_bytetrack.mp4"
    _write_fixture(out)
    iou = _run(out, "iou")
    byte = _run(out, "bytetrack")
    print("=== IoU vs ByteTrack (scripted green-box fixture) ===")
    for row in (iou, byte):
        print(row)


if __name__ == "__main__":
    main()
