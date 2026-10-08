"""Metrics Engine: turns spatial events into persistent, idempotent metric samples.

Flow:  SpatialEvent / TrackObservation → MetricsEngine.ingest → metric_samples (+ ledger, state)

Design notes
------------
* Every applied contribution is recorded in ``metric_ledger`` under a deterministic
  ``source_key`` = ``scope|run|<occurrence>|<metric>``. Re-ingesting the same spatial
  event (same occurrence_id) is a no-op → idempotent.
* Samples are keyed by ``sample_key`` (scope, run, metric, dims, bucket, bucket_start)
  and accumulate ``value`` / ``count`` / ``sum`` / ``min`` / ``max``.
* Buckets: ``hour`` and ``day`` are written now; the schema allows ``week``/``month``.
* Bucket boundaries follow the configured local timezone (default Asia/Jerusalem),
  stored as aware UTC instants.
* ``scope`` isolates test data: Video Lab writes ``video_lab`` + ``analysis_run_id`` so
  repeated analysis never inflates ``production`` totals.
"""

from __future__ import annotations

import uuid
from collections import OrderedDict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.models import MetricLedger, MetricSample, MetricState
from app.domain.spatial import SpatialEvent
from app.domain.vision_capabilities import VEHICLE_CLASSES

SCOPE_PRODUCTION = "production"
SCOPE_VIDEO_LAB = "video_lab"

BUCKETS: tuple[str, ...] = ("hour", "day")

METRIC_ZONE_ENTRIES = "zone_entries"
METRIC_ZONE_EXITS = "zone_exits"
METRIC_LINE_CROSSINGS = "line_crossings"
METRIC_UNIQUE_OBJECTS = "unique_objects"
METRIC_DWELL = "dwell"  # count = sessions, sum_value = total seconds, max_value = longest
METRIC_OCCUPANCY_PEAK = "occupancy_peak"  # max_value = peak occupancy, peak_at = when

ALL_METRIC_TYPES: tuple[str, ...] = (
    METRIC_ZONE_ENTRIES,
    METRIC_ZONE_EXITS,
    METRIC_LINE_CROSSINGS,
    METRIC_UNIQUE_OBJECTS,
    METRIC_DWELL,
    METRIC_OCCUPANCY_PEAK,
)

_LEDGER_CACHE_MAX = 50_000


@dataclass(frozen=True, slots=True)
class MetricsContext:
    scope: str = SCOPE_PRODUCTION
    analysis_run_id: str | None = None
    site_id: str | None = None


@dataclass(frozen=True, slots=True)
class TrackObservation:
    """One detection frame of a tracked object (used for unique-object counting)."""

    camera_id: str
    track_id: int
    object_class: str
    timestamp: datetime


@dataclass(slots=True)
class _Delta:
    value: float = 0.0
    count: int = 0
    sum_value: float = 0.0
    min_value: float | None = None
    max_value: float | None = None
    peak_at: datetime | None = None

    def add(self, *, value: float = 0.0, count: int = 0, sample: float | None = None, at: datetime | None = None) -> None:
        self.value += value
        self.count += count
        if sample is not None:
            self.sum_value += sample
            if self.min_value is None or sample < self.min_value:
                self.min_value = sample
            if self.max_value is None or sample > self.max_value:
                self.max_value = sample
                self.peak_at = at


@dataclass(slots=True)
class _SampleRef:
    scope: str
    analysis_run_id: str | None
    metric_type: str
    site_id: str | None
    camera_id: str | None
    zone_id: str | None
    line_id: str | None
    object_class: str | None
    direction: str | None
    bucket: str
    bucket_start: datetime
    delta: _Delta = field(default_factory=_Delta)

    @property
    def key(self) -> str:
        return "|".join(
            [
                self.scope,
                self.analysis_run_id or "-",
                self.metric_type,
                self.site_id or "-",
                self.camera_id or "-",
                self.zone_id or "-",
                self.line_id or "-",
                self.object_class or "-",
                self.direction or "-",
                self.bucket,
                self.bucket_start.isoformat(),
            ]
        )


@dataclass(slots=True)
class OccupancyState:
    active: dict[str, str] = field(default_factory=dict)  # track_id -> object_class
    current: int = 0
    peak: int = 0
    peak_at: str | None = None
    updated_at: str | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            "active": dict(self.active),
            "current": self.current,
            "peak": self.peak,
            "peak_at": self.peak_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_json(cls, raw: dict[str, Any] | None) -> OccupancyState:
        raw = raw or {}
        return cls(
            active={str(k): str(v) for k, v in dict(raw.get("active") or {}).items()},
            current=int(raw.get("current") or 0),
            peak=int(raw.get("peak") or 0),
            peak_at=raw.get("peak_at"),
            updated_at=raw.get("updated_at"),
        )


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def occupancy_state_key(ctx: MetricsContext, camera_id: str, zone_id: str) -> str:
    return f"{ctx.scope}|{ctx.analysis_run_id or '-'}|occupancy|{camera_id}|{zone_id}"


class MetricsEngine:
    """Deterministic, idempotent metric accumulator. Safe to re-create (DB is the source of truth)."""

    def __init__(self, *, timezone: str = "Asia/Jerusalem") -> None:
        try:
            self._tz = ZoneInfo(timezone)
        except (ZoneInfoNotFoundError, ValueError):  # pragma: no cover - tz database missing
            self._tz = UTC  # type: ignore[assignment]
        self._ledger_cache: OrderedDict[str, None] = OrderedDict()

    # ------------------------------------------------------------------ buckets
    def bucket_start(self, ts: datetime, bucket: str) -> datetime:
        local = _aware(ts).astimezone(self._tz)
        if bucket == "hour":
            start = local.replace(minute=0, second=0, microsecond=0)
        elif bucket == "day":
            start = local.replace(hour=0, minute=0, second=0, microsecond=0)
        elif bucket == "week":
            day0 = local.replace(hour=0, minute=0, second=0, microsecond=0)
            start = day0 - timedelta(days=day0.weekday())
        elif bucket == "month":
            start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            raise ValueError(f"unknown bucket: {bucket}")
        return start.astimezone(UTC)

    # ------------------------------------------------------------------ ledger
    def _remember(self, key: str) -> None:
        self._ledger_cache[key] = None
        if len(self._ledger_cache) > _LEDGER_CACHE_MAX:
            self._ledger_cache.popitem(last=False)

    async def _filter_new(self, session: AsyncSession, keys: list[str]) -> set[str]:
        """Return the subset of keys that have not been applied yet."""
        unknown = [k for k in dict.fromkeys(keys) if k not in self._ledger_cache]
        if not unknown:
            return set()
        existing: set[str] = set()
        chunk = 400
        for i in range(0, len(unknown), chunk):
            part = unknown[i : i + chunk]
            result = await session.execute(
                select(MetricLedger.source_key).where(MetricLedger.source_key.in_(part))
            )
            existing.update(str(k) for k in result.scalars().all())
        for k in existing:
            self._remember(k)
        return {k for k in unknown if k not in existing}

    # ------------------------------------------------------------------ ingest
    async def ingest(
        self,
        session: AsyncSession,
        *,
        spatial_events: Iterable[SpatialEvent] = (),
        observations: Iterable[TrackObservation] = (),
        ctx: MetricsContext | None = None,
    ) -> int:
        """Apply spatial events + observations. Returns number of ledger entries written."""
        ctx = ctx or MetricsContext()
        prefix = f"{ctx.scope}|{ctx.analysis_run_id or '-'}"

        events = sorted(
            (e for e in spatial_events if e.kind in {"zone_enter", "zone_exit", "line_cross"}),
            key=lambda e: _aware(e.timestamp),
        )
        obs = sorted(observations, key=lambda o: _aware(o.timestamp))

        # Candidate ledger keys
        ev_keys: list[tuple[str, SpatialEvent]] = []
        for ev in events:
            ev_keys.append((f"{prefix}|{ev.occurrence_id}|{ev.kind}", ev))
        obs_keys: list[tuple[str, TrackObservation]] = []
        seen_obs: set[str] = set()
        for o in obs:
            k = f"{prefix}|unique|{o.camera_id}|{o.object_class}|{o.track_id}"
            if k in seen_obs:
                continue
            seen_obs.add(k)
            obs_keys.append((k, o))

        new_keys = await self._filter_new(session, [k for k, _ in ev_keys] + [k for k, _ in obs_keys])
        if not new_keys:
            return 0

        samples: dict[str, _SampleRef] = {}
        states: dict[str, OccupancyState] = {}

        def ref(metric: str, at: datetime, **dims: str | None) -> list[_SampleRef]:
            out: list[_SampleRef] = []
            for bucket in BUCKETS:
                r = _SampleRef(
                    scope=ctx.scope,
                    analysis_run_id=ctx.analysis_run_id,
                    metric_type=metric,
                    site_id=ctx.site_id,
                    camera_id=dims.get("camera_id"),
                    zone_id=dims.get("zone_id"),
                    line_id=dims.get("line_id"),
                    object_class=dims.get("object_class"),
                    direction=dims.get("direction"),
                    bucket=bucket,
                    bucket_start=self.bucket_start(at, bucket),
                )
                existing = samples.get(r.key)
                if existing is None:
                    samples[r.key] = r
                    existing = r
                out.append(existing)
            return out

        async def occupancy(camera_id: str, zone_id: str) -> OccupancyState:
            key = occupancy_state_key(ctx, camera_id, zone_id)
            st = states.get(key)
            if st is None:
                row = await session.get(MetricState, key)
                st = OccupancyState.from_json(row.value_json if row else None)
                states[key] = st
            return st

        applied = 0

        # Unique objects (first observation of a track per camera/class)
        for key, o in obs_keys:
            if key not in new_keys:
                continue
            at = _aware(o.timestamp)
            for r in ref(METRIC_UNIQUE_OBJECTS, at, camera_id=o.camera_id, object_class=o.object_class):
                r.delta.add(value=1, count=1)
            session.add(MetricLedger(source_key=key, scope=ctx.scope, analysis_run_id=ctx.analysis_run_id))
            self._remember(key)
            applied += 1

        for key, ev in ev_keys:
            if key not in new_keys:
                continue
            at = _aware(ev.timestamp)
            if ev.kind == "zone_enter" and ev.zone_id:
                for r in ref(
                    METRIC_ZONE_ENTRIES, at, camera_id=ev.camera_id, zone_id=ev.zone_id, object_class=ev.object_class
                ):
                    r.delta.add(value=1, count=1)
                st = await occupancy(ev.camera_id, ev.zone_id)
                st.active[str(ev.track_id)] = ev.object_class
                st.current = len(st.active)
                st.updated_at = at.isoformat()
                if st.current > st.peak:
                    st.peak = st.current
                    st.peak_at = at.isoformat()
                for r in ref(METRIC_OCCUPANCY_PEAK, at, camera_id=ev.camera_id, zone_id=ev.zone_id):
                    r.delta.add(sample=float(st.current), at=at)
            elif ev.kind == "zone_exit" and ev.zone_id:
                for r in ref(
                    METRIC_ZONE_EXITS, at, camera_id=ev.camera_id, zone_id=ev.zone_id, object_class=ev.object_class
                ):
                    r.delta.add(value=1, count=1)
                duration = float(ev.duration_seconds or 0.0)
                for r in ref(
                    METRIC_DWELL, at, camera_id=ev.camera_id, zone_id=ev.zone_id, object_class=ev.object_class
                ):
                    r.delta.add(value=duration, count=1, sample=duration, at=at)
                st = await occupancy(ev.camera_id, ev.zone_id)
                st.active.pop(str(ev.track_id), None)
                st.current = len(st.active)
                st.updated_at = at.isoformat()
            elif ev.kind == "line_cross" and ev.line_id:
                for r in ref(
                    METRIC_LINE_CROSSINGS,
                    at,
                    camera_id=ev.camera_id,
                    line_id=ev.line_id,
                    object_class=ev.object_class,
                    direction=ev.direction or "any",
                ):
                    r.delta.add(value=1, count=1)
            else:
                continue
            session.add(MetricLedger(source_key=key, scope=ctx.scope, analysis_run_id=ctx.analysis_run_id))
            self._remember(key)
            applied += 1

        await self._flush_samples(session, samples)
        await self._flush_states(session, ctx, states)
        return applied

    async def _flush_samples(self, session: AsyncSession, samples: dict[str, _SampleRef]) -> None:
        if not samples:
            return
        keys = list(samples.keys())
        rows: dict[str, MetricSample] = {}
        chunk = 400
        for i in range(0, len(keys), chunk):
            part = keys[i : i + chunk]
            result = await session.execute(select(MetricSample).where(MetricSample.sample_key.in_(part)))
            for row in result.scalars().all():
                rows[row.sample_key] = row
        now = datetime.now(UTC)
        for key, r in samples.items():
            d = r.delta
            if d.count == 0 and d.value == 0.0 and d.max_value is None:
                continue
            row = rows.get(key)
            if row is None:
                row = MetricSample(
                    id=f"ms_{uuid.uuid4().hex[:16]}",
                    sample_key=key,
                    scope=r.scope,
                    analysis_run_id=r.analysis_run_id,
                    metric_type=r.metric_type,
                    site_id=r.site_id,
                    camera_id=r.camera_id,
                    zone_id=r.zone_id,
                    line_id=r.line_id,
                    object_class=r.object_class,
                    direction=r.direction,
                    bucket=r.bucket,
                    bucket_start=r.bucket_start,
                    value=0.0,
                    count=0,
                    sum_value=0.0,
                    updated_at=now,
                )
                session.add(row)
                rows[key] = row
            row.value = float(row.value or 0.0) + d.value
            row.count = int(row.count or 0) + d.count
            row.sum_value = float(row.sum_value or 0.0) + d.sum_value
            if d.min_value is not None and (row.min_value is None or d.min_value < row.min_value):
                row.min_value = d.min_value
            if d.max_value is not None and (row.max_value is None or d.max_value > row.max_value):
                row.max_value = d.max_value
                row.peak_at = d.peak_at
            row.updated_at = now

    async def _flush_states(
        self, session: AsyncSession, ctx: MetricsContext, states: dict[str, OccupancyState]
    ) -> None:
        for key, st in states.items():
            row = await session.get(MetricState, key)
            parts = key.split("|")
            camera_id = parts[3] if len(parts) > 3 else None
            zone_id = parts[4] if len(parts) > 4 else None
            if row is None:
                row = MetricState(
                    state_key=key,
                    scope=ctx.scope,
                    analysis_run_id=ctx.analysis_run_id,
                    kind="occupancy",
                    camera_id=camera_id,
                    zone_id=zone_id,
                    value_json=st.to_json(),
                )
                session.add(row)
            else:
                row.value_json = st.to_json()
                row.updated_at = datetime.now(UTC)

    # ------------------------------------------------------------------ reads
    async def get_occupancy(
        self, session: AsyncSession, ctx: MetricsContext, camera_id: str, zone_id: str
    ) -> OccupancyState:
        row = await session.get(MetricState, occupancy_state_key(ctx, camera_id, zone_id))
        return OccupancyState.from_json(row.value_json if row else None)
