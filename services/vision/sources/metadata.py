"""Video metadata probing via OpenCV (primary) and optional ffprobe."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import cv2

from sources.base import VideoMetadata

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
MAX_DURATION_SEC = 30.0
MAX_UPLOAD_BYTES = 80 * 1024 * 1024  # 80 MB soft for 30s


class VideoValidationError(Exception):
    """User-facing Hebrew validation failures (no raw toolkit text)."""

    def __init__(self, message_he: str) -> None:
        super().__init__(message_he)
        self.message_he = message_he


def validate_upload(*, filename: str, size_bytes: int) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise VideoValidationError("סוג הקובץ אינו נתמך. העלו קובץ וידאו (MP4).")
    if size_bytes <= 0:
        raise VideoValidationError("הקובץ ריק או לא ניתן לקריאה.")
    if size_bytes > MAX_UPLOAD_BYTES:
        raise VideoValidationError("הקובץ גדול מדי. הגבלה היא כ־80MB לסרטון קצר.")


def probe_video(path: Path) -> VideoMetadata:
    path = Path(path)
    if not path.is_file():
        raise VideoValidationError("לא הצלחנו לקרוא את קובץ הווידאו.")

    meta = _probe_opencv(path)
    if meta is None:
        meta = _probe_ffprobe(path)
    if meta is None:
        raise VideoValidationError("לא הצלחנו לקרוא את מטא־הנתונים של הווידאו.")

    if meta.duration_sec <= 0 or meta.width <= 0 or meta.height <= 0:
        raise VideoValidationError("קובץ הווידאו אינו תקין.")
    if meta.duration_sec > MAX_DURATION_SEC + 0.5:
        raise VideoValidationError(
            f"משך הסרטון ארוך מדי. המקסימום כרגע הוא {int(MAX_DURATION_SEC)} שניות."
        )
    return meta


def _probe_opencv(path: Path) -> VideoMetadata | None:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return None
    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if fps <= 1e-3:
            fps = 25.0
        duration = frame_count / fps if frame_count > 0 else 0.0
        if duration <= 0:
            # Fallback: read until end (short clips only)
            count = 0
            while True:
                ok, _ = cap.read()
                if not ok:
                    break
                count += 1
            frame_count = count
            duration = count / fps
        fourcc = int(cap.get(cv2.CAP_PROP_FOURCC) or 0)
        codec = "".join(chr((fourcc >> 8 * i) & 0xFF) for i in range(4)).strip() or "unknown"
        return VideoMetadata(
            duration_sec=float(duration),
            width=width,
            height=height,
            fps=float(fps),
            codec=codec,
            frame_count=frame_count if frame_count > 0 else None,
        )
    finally:
        cap.release()


def _probe_ffprobe(path: Path) -> VideoMetadata | None:
    binary = shutil.which("ffprobe")
    if not binary:
        return None
    try:
        proc = subprocess.run(
            [
                binary,
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(path),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode != 0:
            return None
        data = json.loads(proc.stdout or "{}")
        streams = data.get("streams") or []
        video = next((s for s in streams if s.get("codec_type") == "video"), None)
        if not video:
            return None
        width = int(video.get("width") or 0)
        height = int(video.get("height") or 0)
        codec = str(video.get("codec_name") or "unknown")
        fps = _parse_fps(video.get("avg_frame_rate") or video.get("r_frame_rate") or "25/1")
        duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
        nb = video.get("nb_frames")
        frame_count = int(nb) if nb not in (None, "N/A") else None
        return VideoMetadata(
            duration_sec=duration,
            width=width,
            height=height,
            fps=fps,
            codec=codec,
            frame_count=frame_count,
        )
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError, ValueError, TypeError):
        return None


def _parse_fps(value: str) -> float:
    try:
        if "/" in value:
            a, b = value.split("/", 1)
            den = float(b)
            return float(a) / den if den else 25.0
        return float(value)
    except (ValueError, ZeroDivisionError):
        return 25.0
