"""Schedule evaluation including ranges that cross midnight."""

from __future__ import annotations

from datetime import UTC, datetime, time
from typing import Any


def _parse_hhmm(value: str) -> time:
    hour_s, minute_s = value.split(":")
    return time(hour=int(hour_s), minute=int(minute_s))


def is_within_schedule(now: datetime, schedule: dict[str, Any] | None) -> bool:
    """Return True if `now` is inside schedule window.

    Supports overnight windows (e.g. 22:00–06:00).
    Optional `days`: list of weekday ints (Mon=0 … Sun=6), matching datetime.weekday().
    """
    if not schedule:
        return True

    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)

    days = schedule.get("days")
    if days is not None and int(now.weekday()) not in {int(d) for d in days}:
        return False

    start = _parse_hhmm(str(schedule["from"]))
    end = _parse_hhmm(str(schedule["to"]))
    current = now.timetz().replace(tzinfo=None)

    if start == end:
        # Full-day window
        return True
    if start < end:
        return start <= current < end
    # Crosses midnight
    return current >= start or current < end
