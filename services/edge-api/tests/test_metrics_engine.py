"""Metrics Engine unit tests — counts, dwell, occupancy, idempotency, persistence."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.adapters.models  # noqa: F401 — register tables
from app.adapters.db import Base
from app.domain.metrics import (
    METRIC_DWELL,
    METRIC_LINE_CROSSINGS,
    METRIC_OCCUPANCY_PEAK,
    METRIC_ZONE_ENTRIES,
    MetricsContext,
    MetricsEngine,
    TrackObservation,
)
from app.domain.metrics.queries import MetricFilters, breakdown, summary, timeseries
from app.domain.spatial import SpatialEvent

T0 = datetime(2026, 10, 6, 7, 0, 0, tzinfo=UTC)  # 10:00 Asia/Jerusalem


def _ts(sec: float) -> datetime:
    return T0 + timedelta(seconds=sec)


def _cross(track_id: int, cls: str, sec: float, *, line_id: str = "gate_a", direction: str = "a_to_b") -> SpatialEvent:
    return SpatialEvent(
        kind="line_cross",
        camera_id="cam",
        track_id=track_id,
        object_class=cls,
        confidence=0.9,
        timestamp=_ts(sec),
        line_id=line_id,
        direction=direction,
        occurrence_id=f"cross:cam:{track_id}:{line_id}:{direction}:{_ts(sec).isoformat()}",
    )


def _enter(track_id: int, cls: str, sec: float, zone_id: str = "z1") -> SpatialEvent:
    return SpatialEvent(
        kind="zone_enter",
        camera_id="cam",
        track_id=track_id,
        object_class=cls,
        confidence=0.9,
        timestamp=_ts(sec),
        zone_id=zone_id,
        occurrence_id=f"enter:cam:{track_id}:{zone_id}:{_ts(sec).isoformat()}",
    )


def _exit(track_id: int, cls: str, sec: float, duration: float, zone_id: str = "z1") -> SpatialEvent:
    return SpatialEvent(
        kind="zone_exit",
        camera_id="cam",
        track_id=track_id,
        object_class=cls,
        confidence=0.9,
        timestamp=_ts(sec),
        zone_id=zone_id,
        duration_seconds=duration,
        occurrence_id=f"exit:cam:{track_id}:{zone_id}:{_ts(sec).isoformat()}",
    )


@pytest.fixture
async def db(tmp_path: Path):
    url = f"sqlite+aiosqlite:///{(tmp_path / 'metrics.db').as_posix()}"
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    yield factory
    await engine.dispose()


@pytest.mark.asyncio
async def test_seven_unique_cars_cross_line(db) -> None:
    engine = MetricsEngine()
    events = [_cross(i, "car", i * 2.0) for i in range(1, 8)]
    async with db() as session:
        applied = await engine.ingest(session, spatial_events=events, ctx=MetricsContext())
        await session.commit()
    assert applied == 7
    async with db() as session:
        s = await summary(session, MetricFilters())
    assert s["totals"]["line_crossings"] == 7
    assert s["vehicles"]["line_crossings"] == 7


@pytest.mark.asyncio
async def test_same_car_100_frames_counts_once(db) -> None:
    engine = MetricsEngine()
    obs = [TrackObservation("cam", 42, "car", _ts(i * 0.1)) for i in range(100)]
    async with db() as session:
        await engine.ingest(session, observations=obs, ctx=MetricsContext())
        await session.commit()
    async with db() as session:
        s = await summary(session, MetricFilters())
    assert s["totals"]["unique_objects"] == 1
    assert s["vehicles"]["unique_objects"] == 1


@pytest.mark.asyncio
async def test_dwell_average_of_three_sessions(db) -> None:
    engine = MetricsEngine()
    events = [
        _enter(1, "person", 0), _exit(1, "person", 10, 10),
        _enter(2, "person", 0), _exit(2, "person", 20, 20),
        _enter(3, "person", 0), _exit(3, "person", 30, 30),
    ]
    async with db() as session:
        await engine.ingest(session, spatial_events=events, ctx=MetricsContext())
        await session.commit()
    async with db() as session:
        s = await summary(session, MetricFilters())
        ts = await timeseries(session, MetricFilters(), metric_type=METRIC_DWELL, bucket="hour")
    assert s["dwell"]["sessions"] == 3
    assert s["dwell"]["avg_seconds"] == 20.0
    assert s["dwell"]["max_seconds"] == 30.0
    assert ts[0]["value"] == 20.0


@pytest.mark.asyncio
async def test_occupancy_sequence_1_2_1(db) -> None:
    engine = MetricsEngine()
    ctx = MetricsContext()
    seq: list[int] = []
    for ev in [_enter(1, "person", 0), _enter(2, "person", 1), _exit(1, "person", 2, 2)]:
        async with db() as session:
            await engine.ingest(session, spatial_events=[ev], ctx=ctx)
            await session.commit()
        async with db() as session:
            st = await engine.get_occupancy(session, ctx, "cam", "z1")
            seq.append(st.current)
    assert seq == [1, 2, 1]


@pytest.mark.asyncio
async def test_peak_occupancy_is_max_simultaneous(db) -> None:
    engine = MetricsEngine()
    ctx = MetricsContext()
    events = [_enter(i, "person", i) for i in range(1, 6)] + [_exit(i, "person", 10 + i, 10) for i in range(1, 6)]
    async with db() as session:
        await engine.ingest(session, spatial_events=events, ctx=ctx)
        await session.commit()
    async with db() as session:
        st = await engine.get_occupancy(session, ctx, "cam", "z1")
        s = await summary(session, MetricFilters())
    assert st.current == 0
    assert st.peak == 5
    assert st.peak_at is not None
    assert s["peak_occupancy"] == 5


@pytest.mark.asyncio
async def test_idempotent_same_source_twice(db) -> None:
    engine = MetricsEngine()
    ev = _cross(7, "truck", 3.0)
    async with db() as session:
        first = await engine.ingest(session, spatial_events=[ev], ctx=MetricsContext())
        await session.commit()
    async with db() as session:
        second = await engine.ingest(session, spatial_events=[ev], ctx=MetricsContext())
        await session.commit()
    assert first == 1 and second == 0
    async with db() as session:
        s = await summary(session, MetricFilters())
    assert s["totals"]["line_crossings"] == 1


@pytest.mark.asyncio
async def test_persists_across_engine_restart(db) -> None:
    ev = _cross(9, "car", 1.0)
    async with db() as session:
        await MetricsEngine().ingest(session, spatial_events=[ev], ctx=MetricsContext())
        await session.commit()
    # New engine instance == process restart (empty in-memory ledger cache)
    fresh = MetricsEngine()
    async with db() as session:
        again = await fresh.ingest(session, spatial_events=[ev], ctx=MetricsContext())
        await session.commit()
    assert again == 0
    async with db() as session:
        s = await summary(session, MetricFilters())
    assert s["totals"]["line_crossings"] == 1


@pytest.mark.asyncio
async def test_hour_and_day_buckets(db) -> None:
    engine = MetricsEngine(timezone="UTC")
    events = [_enter(1, "car", 0), _enter(2, "car", 3600 + 5), _enter(3, "car", 7200 + 5)]
    async with db() as session:
        await engine.ingest(session, spatial_events=events, ctx=MetricsContext())
        await session.commit()
    async with db() as session:
        hours = await timeseries(session, MetricFilters(), metric_type=METRIC_ZONE_ENTRIES, bucket="hour")
        days = await timeseries(session, MetricFilters(), metric_type=METRIC_ZONE_ENTRIES, bucket="day")
    assert [p["value"] for p in hours] == [1.0, 1.0, 1.0]
    assert hours[0]["bucket_start"] == T0.replace(minute=0, second=0)
    assert len(days) == 1 and days[0]["value"] == 3.0
    assert days[0]["bucket_start"] == T0.replace(hour=0, minute=0, second=0)


@pytest.mark.asyncio
async def test_scope_isolation_video_lab_vs_production(db) -> None:
    engine = MetricsEngine()
    lab_ctx = MetricsContext(scope="video_lab", analysis_run_id="run_1")
    lab_ctx2 = MetricsContext(scope="video_lab", analysis_run_id="run_2")
    events = [_cross(i, "car", i) for i in range(1, 8)] + [_cross(i, "truck", 10 + i) for i in range(8, 10)]
    async with db() as session:
        await engine.ingest(session, spatial_events=events, ctx=lab_ctx)
        await engine.ingest(session, spatial_events=events, ctx=lab_ctx2)  # re-analysis
        await session.commit()
    async with db() as session:
        prod = await summary(session, MetricFilters())
        run1 = await summary(session, MetricFilters(scope="video_lab", analysis_run_id="run_1"))
        all_lab = await summary(session, MetricFilters(scope="video_lab"))
        by_class = await breakdown(
            session,
            MetricFilters(scope="video_lab", analysis_run_id="run_1"),
            metric_type=METRIC_LINE_CROSSINGS,
            by="object_class",
        )
    assert prod["totals"]["line_crossings"] == 0
    assert run1["totals"]["line_crossings"] == 9
    assert run1["vehicles"]["line_crossings"] == 9
    assert all_lab["totals"]["line_crossings"] == 18
    assert {i["key"]: i["value"] for i in by_class} == {"car": 7.0, "truck": 2.0}


@pytest.mark.asyncio
async def test_range_and_dimension_filters(db) -> None:
    engine = MetricsEngine(timezone="UTC")
    events = [
        _cross(1, "car", 0, line_id="gate_a"),
        _cross(2, "car", 10, line_id="gate_b", direction="b_to_a"),
        _cross(3, "car", 3600 * 5, line_id="gate_a"),
    ]
    async with db() as session:
        await engine.ingest(session, spatial_events=events, ctx=MetricsContext())
        await session.commit()
    async with db() as session:
        in_first_hour = await summary(session, MetricFilters(start=T0, end=T0 + timedelta(hours=1)))
        gate_a = await summary(session, MetricFilters(line_id="gate_a"))
        by_dir = await breakdown(session, MetricFilters(), metric_type=METRIC_LINE_CROSSINGS, by="direction")
        peak_series = await timeseries(session, MetricFilters(), metric_type=METRIC_OCCUPANCY_PEAK, bucket="day")
    assert in_first_hour["totals"]["line_crossings"] == 2
    assert gate_a["totals"]["line_crossings"] == 2
    assert {i["key"]: i["value"] for i in by_dir} == {"a_to_b": 2.0, "b_to_a": 1.0}
    assert peak_series == []
