"""Unique-object counting with aggregation windows and threshold edge fire."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


def _ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


@dataclass
class UniqueCountBucket:
    """In-memory unique track_id counter for one counting context."""

    key: str
    track_times: dict[int, datetime] = field(default_factory=dict)
    threshold_fired: bool = False
    window_started_at: datetime | None = None

    def add(
        self,
        track_id: int,
        at: datetime,
        *,
        window_seconds: int | None,
    ) -> int:
        at = _ensure_aware(at)
        if window_seconds and window_seconds > 0:
            self._expire(at, window_seconds)
            if self.window_started_at is None:
                self.window_started_at = at
        if track_id not in self.track_times:
            self.track_times[track_id] = at
            # New unique object after fire → allow another threshold edge later if count drops
        return len(self.track_times)

    def _expire(self, at: datetime, window_seconds: int) -> None:
        cutoff = at.timestamp() - window_seconds
        before = len(self.track_times)
        self.track_times = {
            tid: ts for tid, ts in self.track_times.items() if _ensure_aware(ts).timestamp() >= cutoff
        }
        if len(self.track_times) < before:
            # Window expiry can re-arm threshold
            self.threshold_fired = False
        if not self.track_times:
            self.window_started_at = None

    @property
    def value(self) -> int:
        return len(self.track_times)


def compare_threshold(value: float, operator: str, threshold: float) -> bool:
    op = (operator or "gte").lower()
    if op == "gte":
        return value >= threshold
    if op == "gt":
        return value > threshold
    if op == "lte":
        return value <= threshold
    if op == "lt":
        return value < threshold
    if op == "eq":
        return value == threshold
    return False


@dataclass
class ThresholdFire:
    count: int
    threshold: float
    operator: str
    window_seconds: int | None
    first_fire: bool


class CounterStore:
    """Deterministic unique-object counters keyed by rule/camera/line/zone/class/direction."""

    def __init__(self) -> None:
        self._buckets: dict[str, UniqueCountBucket] = {}

    def observe(
        self,
        *,
        key: str,
        track_id: int,
        at: datetime,
        window_seconds: int | None,
        operator: str,
        threshold: float,
    ) -> tuple[int, ThresholdFire | None]:
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = UniqueCountBucket(key=key)
            self._buckets[key] = bucket

        count = bucket.add(track_id, at, window_seconds=window_seconds)
        met = compare_threshold(float(count), operator, threshold)
        fire: ThresholdFire | None = None
        if met and not bucket.threshold_fired:
            bucket.threshold_fired = True
            fire = ThresholdFire(
                count=count,
                threshold=threshold,
                operator=operator,
                window_seconds=window_seconds,
                first_fire=True,
            )
        elif not met:
            bucket.threshold_fired = False
        return count, fire

    def clear(self) -> None:
        self._buckets.clear()

    def clear_prefix(self, prefix: str) -> None:
        self._buckets = {k: v for k, v in self._buckets.items() if not k.startswith(prefix)}

    def snapshot(self, key: str) -> dict[str, Any] | None:
        b = self._buckets.get(key)
        if b is None:
            return None
        return {
            "value": b.value,
            "track_ids": sorted(b.track_times.keys()),
            "threshold_fired": b.threshold_fired,
            "window_started_at": b.window_started_at.isoformat() if b.window_started_at else None,
        }
