"""Render unique-track gallery snapshots for Video Lab results."""

from __future__ import annotations

from pathlib import Path

# Fix unused Any import if we need numpy - use ndarray
from typing import Any

import cv2
import numpy as np

_CLASS_HE = {
    "person": "אדם",
    "car": "רכב",
    "truck": "משאית",
    "bus": "אוטובוס",
    "bicycle": "אופניים",
    "motorcycle": "אופנוע",
}

_BOX_BGR = {
    "bicycle": (248, 189, 56),
    "motorcycle": (238, 211, 34),
    "person": (245, 245, 245),
    "car": (36, 191, 251),
    "truck": (60, 146, 251),
    "bus": (22, 115, 249),
}


def class_he(name: str) -> str:
    return _CLASS_HE.get(name, name)


def apply_box_label(
    frame: np.ndarray,
    *,
    bbox: list[float],
    label: str,
    class_name: str,
) -> None:
    color = _BOX_BGR.get(class_name, (220, 220, 220))
    x1, y1, x2, y2 = [round(v) for v in bbox]
    h, w = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    font = cv2.FONT_HERSHEY_SIMPLEX
    (tw, th), _ = cv2.getTextSize(label, font, 0.55, 1)
    ty = max(0, y1 - 8)
    cv2.rectangle(frame, (x1, ty - th - 6), (x1 + tw + 8, ty + 4), (20, 20, 20), -1)
    cv2.putText(frame, label, (x1 + 4, ty), font, 0.55, color, 1, cv2.LINE_AA)


def extract_annotated_frame(
    video_path: Path | str,
    *,
    frame_index: int,
    bbox: list[float],
    label: str,
    class_name: str,
    out_path: Path,
) -> bool:
    """Seek to frame_index, draw ONE bbox + label, write JPEG."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return False
    try:
        frame = _read_frame(cap, frame_index)
        if frame is None:
            return False
        apply_box_label(frame, bbox=bbox, label=label, class_name=class_name)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        return bool(cv2.imwrite(str(out_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 88]))
    finally:
        cap.release()


def read_frame_at_index(cap: cv2.VideoCapture, frame_index: int) -> np.ndarray | None:
    """Public alias for frame seek helper."""
    return _read_frame(cap, frame_index)


def _read_frame(cap: cv2.VideoCapture, frame_index: int) -> np.ndarray | None:
    cap.set(cv2.CAP_PROP_POS_FRAMES, float(max(0, frame_index)))
    ok, frame = cap.read()
    if ok and frame is not None:
        return frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    for i in range(frame_index + 1):
        ok, frame = cap.read()
        if not ok or frame is None:
            return None
        if i == frame_index:
            return frame
    return None


def build_track_result_images(
    *,
    video_path: Path | str,
    job_id: str,
    results_dir: Path,
    track_gallery: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Write one JPEG per unique track into data/test-results/{job_id}/."""
    job_dir = results_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    cards: list[dict[str, Any]] = []
    if not track_gallery:
        return cards

    # Sort by frame index and open the video once (seeking is expensive).
    ordered = sorted(track_gallery, key=lambda c: int(c.get("frame_index") or 0))
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return [
            {
                **card,
                "class_he": class_he(str(card["class"])),
                "image_key": f"track_{int(card['track_id']):04d}",
                "has_image": False,
                "image_url": f"/api/v1/video-lab/jobs/{job_id}/tracks/{int(card['track_id'])}/image",
            }
            for card in track_gallery
        ]

    by_tid: dict[int, dict[str, Any]] = {}
    try:
        for card in ordered:
            tid = int(card["track_id"])
            cls = str(card["class"])
            conf_pct = int(
                card.get("confidence_pct") or round(float(card.get("confidence") or 0) * 100)
            )
            image_key = f"track_{tid:04d}"
            out_path = job_dir / f"{image_key}.jpg"
            label = f"{class_he(cls)} {conf_pct}%"
            frame = _read_frame(cap, int(card.get("frame_index") or 0))
            ok = False
            if frame is not None:
                annotated = frame.copy()
                apply_box_label(
                    annotated,
                    bbox=list(card.get("bbox") or [0, 0, 0, 0]),
                    label=label,
                    class_name=cls,
                )
                ok = bool(cv2.imwrite(str(out_path), annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 88]))
            by_tid[tid] = {
                **card,
                "class_he": class_he(cls),
                "image_key": image_key,
                "has_image": ok,
                "image_url": f"/api/v1/video-lab/jobs/{job_id}/tracks/{tid}/image",
            }
    finally:
        cap.release()

    # Preserve original gallery order
    for card in track_gallery:
        tid = int(card["track_id"])
        cards.append(by_tid.get(tid) or {**card, "has_image": False})
    return cards


# Back-compat helper used by older summary path
def build_best_frame_cards(
    *,
    video_path: Path | str,
    job_id: str,
    frames_dir: Path,
    best_by_class: dict[str, Any],
    unique_tracks_by_class: dict[str, int] | None = None,
) -> list[dict[str, Any]]:
    unique_tracks_by_class = unique_tracks_by_class or {}
    cards: list[dict[str, Any]] = []
    for class_name, info in sorted(best_by_class.items(), key=lambda kv: -float(kv[1].confidence)):
        conf = float(info.confidence)
        out_path = frames_dir / f"{job_id}_{class_name}.jpg"
        label = f"{class_he(class_name)} {round(conf * 100)}%"
        ok = extract_annotated_frame(
            video_path,
            frame_index=int(info.frame_index),
            bbox=list(info.bbox),
            label=label,
            class_name=class_name,
            out_path=out_path,
        )
        cards.append(
            {
                "class": class_name,
                "class_he": class_he(class_name),
                "confidence": round(conf, 4),
                "confidence_pct": round(conf * 100),
                "timestamp_sec": round(float(info.timestamp_sec), 3),
                "frame_index": int(info.frame_index),
                "track_id": int(info.track_id),
                "bbox": list(info.bbox),
                "image_key": class_name,
                "has_image": ok,
                "unique_tracks": int(unique_tracks_by_class.get(class_name, 1)),
            }
        )
    return cards
