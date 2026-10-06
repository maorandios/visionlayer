"""In-memory progress for running Video Lab jobs (polled by UI)."""

from __future__ import annotations

import threading
from typing import Any

_lock = threading.Lock()
_PROGRESS: dict[str, dict[str, Any]] = {}


def set_progress(
    job_id: str,
    *,
    percent: float,
    frames_done: int = 0,
    frames_total: int = 0,
    phase_he: str = "",
    status: str = "running",
) -> None:
    with _lock:
        _PROGRESS[job_id] = {
            "percent": round(max(0.0, min(100.0, float(percent))), 1),
            "frames_done": int(frames_done),
            "frames_total": int(frames_total),
            "phase_he": phase_he,
            "status": status,
        }


def get_progress(job_id: str) -> dict[str, Any] | None:
    with _lock:
        data = _PROGRESS.get(job_id)
        return dict(data) if data else None


def clear_progress(job_id: str) -> None:
    with _lock:
        _PROGRESS.pop(job_id, None)
