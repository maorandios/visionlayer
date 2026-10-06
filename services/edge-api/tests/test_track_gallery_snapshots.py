"""Gallery snapshot rendering — single-object BB only."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from app.domain.video_lab.snapshots import extract_annotated_frame


def test_bbox_rendering_draws_only_selected_object(tmp_path: Path) -> None:
    video = tmp_path / "two_boxes.mp4"
    w, h = 320, 240
    writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*"mp4v"), 5.0, (w, h))
    assert writer.isOpened()
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    frame[:] = (40, 40, 40)
    cv2.rectangle(frame, (20, 30), (80, 140), (0, 220, 0), -1)
    cv2.rectangle(frame, (200, 40), (280, 150), (0, 220, 0), -1)
    for _ in range(5):
        writer.write(frame)
    writer.release()

    out = tmp_path / "track.jpg"
    ok = extract_annotated_frame(
        video,
        frame_index=0,
        bbox=[20, 30, 80, 140],
        label="motorcycle 90%",
        class_name="motorcycle",
        out_path=out,
    )
    assert ok is True
    img = cv2.imread(str(out))
    assert img is not None
    # Motorcycle box color in snapshots.py is BGR (238, 211, 34)
    left_border = img[30, 20]
    assert int(left_border[0]) > 100  # B channel elevated by cyan/yellow stroke
    # Far from left box — still grayish background (no second BB drawn at right box)
    right_corner = img[40, 200]
    # Right green fill may remain from source frame; stroke for motorcycle is yellow-cyan.
    # Ensure we did not paint the motorcycle stroke color on the right box top-left.
    motorcycle_stroke = np.array([238, 211, 34], dtype=np.int16)
    dist_right = np.abs(right_corner.astype(np.int16) - motorcycle_stroke).sum()
    dist_left = np.abs(left_border.astype(np.int16) - motorcycle_stroke).sum()
    assert dist_left < dist_right
