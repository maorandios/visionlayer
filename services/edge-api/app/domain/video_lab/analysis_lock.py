"""Ensure only one Video Lab analysis runs at a time on the development PC."""

from __future__ import annotations

import threading

_lock = threading.Lock()
_active_job_id: str | None = None


def try_acquire(job_id: str) -> bool:
    global _active_job_id
    with _lock:
        if _active_job_id is not None:
            return False
        _active_job_id = job_id
        return True


def release(job_id: str | None = None) -> None:
    global _active_job_id
    with _lock:
        if job_id is None or _active_job_id == job_id:
            _active_job_id = None


def active_job_id() -> str | None:
    with _lock:
        return _active_job_id
