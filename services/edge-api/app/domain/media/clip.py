"""Short MP4 clips around event trigger time (browser-playable H.264)."""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

import cv2

logger = logging.getLogger(__name__)

# User-facing window around the rule trigger on the video timeline
CLIP_PRE_SEC = 1.3
CLIP_POST_SEC = 1.5


def _ffmpeg_exe() -> str | None:
    """Prefer PATH ffmpeg, then imageio-ffmpeg's bundled binary."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def extract_event_clip(
    *,
    video_path: Path | str,
    out_path: Path,
    trigger_sec: float,
    video_duration_sec: float,
    pre_sec: float = CLIP_PRE_SEC,
    post_sec: float = CLIP_POST_SEC,
) -> bool:
    """Extract [trigger-pre, trigger+post] as H.264 MP4. No detector calls."""
    start = max(0.0, float(trigger_sec) - pre_sec)
    end = min(float(video_duration_sec), float(trigger_sec) + post_sec)
    duration = end - start
    if duration <= 0.05:
        logger.warning("event_clip_skipped reason=invalid_window trigger=%s", trigger_sec)
        return False

    out_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = _ffmpeg_exe()
    if ffmpeg:
        if _extract_with_ffmpeg(
            ffmpeg, Path(video_path), out_path, start=start, duration=duration
        ):
            return True
        logger.warning("event_clip_ffmpeg_failed falling_back=opencv")

    # OpenCV mp4v is often not playable in browsers — last resort only
    return _extract_with_opencv(Path(video_path), out_path, start=start, end=end)


def _extract_with_ffmpeg(
    ffmpeg: str,
    video: Path,
    out_path: Path,
    *,
    start: float,
    duration: float,
) -> bool:
    """Always encode H.264 for Chrome/Edge/Safari <video> playback."""
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(video),
        "-t",
        f"{duration:.3f}",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        str(out_path),
    ]
    return _run_ffmpeg(cmd) and out_path.is_file() and out_path.stat().st_size > 0


def _extract_with_opencv(video: Path, out_path: Path, *, start: float, end: float) -> bool:
    """Frame-accurate clip when no ffmpeg binary is available."""
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        logger.warning("event_clip_opencv_failed reason=open")
        return False
    try:
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        if fps <= 1e-3:
            fps = 10.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        if width <= 0 or height <= 0:
            logger.warning("event_clip_opencv_failed reason=size")
            return False

        start_idx = max(0, int(round(start * fps)))
        end_idx = max(start_idx + 1, int(round(end * fps)))

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(out_path), fourcc, fps, (width, height))
        if not writer.isOpened():
            logger.warning("event_clip_opencv_failed reason=writer")
            return False

        cap.set(cv2.CAP_PROP_POS_FRAMES, float(start_idx))
        written = 0
        for idx in range(start_idx, end_idx):
            ok, frame = cap.read()
            if not ok or frame is None:
                if written == 0 and idx == start_idx:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    for j in range(end_idx):
                        ok2, frame2 = cap.read()
                        if not ok2 or frame2 is None:
                            break
                        if j >= start_idx:
                            writer.write(frame2)
                            written += 1
                break
            writer.write(frame)
            written += 1
        writer.release()

        if written == 0 or not out_path.is_file() or out_path.stat().st_size <= 0:
            out_path.unlink(missing_ok=True)
            logger.warning("event_clip_opencv_failed reason=empty")
            return False
        logger.warning(
            "event_clip_opencv_written frames=%s (may not play in browsers without H.264)",
            written,
        )
        return True
    finally:
        cap.release()


def _run_ffmpeg(cmd: list[str]) -> bool:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.warning("event_clip_ffmpeg_failed err=%s", type(exc).__name__)
        return False
    if proc.returncode != 0:
        logger.warning(
            "event_clip_ffmpeg_failed code=%s stderr=%s",
            proc.returncode,
            (proc.stderr or "")[:200],
        )
        return False
    return True
