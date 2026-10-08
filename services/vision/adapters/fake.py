"""Fake Vision backend — emits valid Unified Detections without YOLOX/ByteTrack/ONNX.

Proves Product Logic depends only on the Detection contract.
"""

from __future__ import annotations

from typing import Any

from detection_contract import build_detection


def emit_scripted_detections(
    *,
    camera_id: str,
    base_unix_ts: float = 1_700_000_000.0,
    source: str = "mock",
) -> list[dict[str, Any]]:
    """Two tracked cars crossing a horizontal line (y≈0.5) over four frames.

    Trajectory (normalized bottom-center y via bbox):
      t0: below line → t1: below → t2: above → t3: above
    Suitable for line-cross / metric / rule swap tests.
    """
    # Frame size 200x100; bbox bottom-center ≈ (x_mid, y2)
    # Line tests typically use y=0.5 → pixel y=50
    samples = [
        # track 1 car: crosses upward (y2 from 80→20)
        (0, 0.0, 1, "car", 0.9, [40.0, 60.0, 80.0, 80.0]),
        (1, 0.2, 1, "car", 0.91, [40.0, 55.0, 80.0, 70.0]),
        (2, 0.4, 1, "car", 0.92, [40.0, 20.0, 80.0, 30.0]),
        (3, 0.6, 1, "car", 0.93, [40.0, 10.0, 80.0, 20.0]),
        # track 2 truck: stays below — no cross
        (0, 0.0, 2, "truck", 0.85, [120.0, 70.0, 160.0, 90.0]),
        (1, 0.2, 2, "truck", 0.86, [120.0, 68.0, 160.0, 88.0]),
        (2, 0.4, 2, "truck", 0.87, [120.0, 66.0, 160.0, 86.0]),
        (3, 0.6, 2, "truck", 0.88, [120.0, 64.0, 160.0, 84.0]),
    ]
    out: list[dict[str, Any]] = []
    for frame_index, video_t, track_id, cls, conf, bbox in samples:
        out.append(
            build_detection(
                camera_id=camera_id,
                class_name=cls,
                confidence=conf,
                bbox=bbox,
                timestamp=base_unix_ts + video_t,
                source=source,
                track_id=track_id,
                frame_size=(200, 100),
                frame_index=frame_index,
                video_timestamp_sec=video_t,
            )
        )
    return out
