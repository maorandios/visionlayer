"""Read-side queries over metric_samples / metric_state (no writes)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.models import Event, MetricSample, MetricState
from app.domain.metrics.engine import (
    METRIC_DWELL,
    METRIC_LINE_CROSSINGS,
    METRIC_OCCUPANCY_PEAK,
    METRIC_UNIQUE_OBJECTS,
    METRIC_ZONE_ENTRIES,
    METRIC_ZONE_EXITS,
    SCOPE_PRODUCTION,
    VEHICLE_CLASSES,
    OccupancyState,
)

OBJECT_GROUPS: dict[str, frozenset[str]] = {
    "vehicle": VEHICLE_CLASSES,
    "person": frozenset({"person"}),
}

BREAKDOWN_DIMS: dict[str, Any] = {
    "camera": MetricSample.camera_id,
    "zone": MetricSample.zone_id,
    "line": MetricSample.line_id,
    "object_class": MetricSample.object_class,
    "direction": MetricSample.direction,
}


@dataclass(frozen=True, slots=True)
class MetricFilters:
    scope: str = SCOPE_PRODUCTION
    analysis_run_id: str | None = None
    start: datetime | None = None
    end: datetime | None = None
    camera_id: str | None = None
    zone_id: str | None = None
    line_id: str | None = None
    object_class: str | None = None  # exact class or group ("vehicle" / "person")
    direction: str | None = None


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _apply(stmt: Select, f: MetricFilters, *, bucket: str) -> Select:
    conds = [MetricSample.scope == f.scope, MetricSample.bucket == bucket]
    if f.analysis_run_id:
        conds.append(MetricSample.analysis_run_id == f.analysis_run_id)
    if f.camera_id:
        conds.append(MetricSample.camera_id == f.camera_id)
    if f.zone_id:
        conds.append(MetricSample.zone_id == f.zone_id)
    if f.line_id:
        conds.append(MetricSample.line_id == f.line_id)
    if f.direction:
        conds.append(MetricSample.direction == f.direction)
    if f.object_class:
        group = OBJECT_GROUPS.get(f.object_class)
        if group:
            conds.append(MetricSample.object_class.in_(sorted(group)))
        else:
            conds.append(MetricSample.object_class == f.object_class)
    start, end = _aware(f.start), _aware(f.end)
    if start is not None:
        conds.append(MetricSample.bucket_start >= start)
    if end is not None:
        conds.append(MetricSample.bucket_start < end)
    return stmt.where(and_(*conds))


def _agg_value(metric_type: str, total_value: float, total_count: int, total_sum: float, max_value: float | None) -> float:
    if metric_type == METRIC_DWELL:
        return round(total_sum / total_count, 2) if total_count else 0.0
    if metric_type == METRIC_OCCUPANCY_PEAK:
        return float(max_value or 0.0)
    return float(total_value)


async def summary(session: AsyncSession, f: MetricFilters) -> dict[str, Any]:
    stmt = select(
        MetricSample.metric_type,
        MetricSample.object_class,
        func.coalesce(func.sum(MetricSample.value), 0.0),
        func.coalesce(func.sum(MetricSample.count), 0),
        func.coalesce(func.sum(MetricSample.sum_value), 0.0),
        func.max(MetricSample.max_value),
    ).group_by(MetricSample.metric_type, MetricSample.object_class)
    stmt = _apply(stmt, f, bucket="hour")
    rows = (await session.execute(stmt)).all()

    totals: dict[str, float] = {
        METRIC_ZONE_ENTRIES: 0.0,
        METRIC_ZONE_EXITS: 0.0,
        METRIC_LINE_CROSSINGS: 0.0,
        METRIC_UNIQUE_OBJECTS: 0.0,
    }
    dwell_sessions = 0
    dwell_total = 0.0
    dwell_max = 0.0
    peak_occupancy = 0.0
    by_class: dict[str, dict[str, float]] = {}

    for metric_type, object_class, v, c, s, mx in rows:
        v = float(v or 0.0)
        c = int(c or 0)
        s = float(s or 0.0)
        if metric_type in totals:
            totals[metric_type] += v
            cls = object_class or "unknown"
            entry = by_class.setdefault(
                cls,
                {
                    METRIC_ZONE_ENTRIES: 0.0,
                    METRIC_ZONE_EXITS: 0.0,
                    METRIC_LINE_CROSSINGS: 0.0,
                    METRIC_UNIQUE_OBJECTS: 0.0,
                },
            )
            entry[metric_type] += v
        elif metric_type == METRIC_DWELL:
            dwell_sessions += c
            dwell_total += s
            dwell_max = max(dwell_max, float(mx or 0.0))
        elif metric_type == METRIC_OCCUPANCY_PEAK:
            peak_occupancy = max(peak_occupancy, float(mx or 0.0))

    def group(classes: frozenset[str]) -> dict[str, int]:
        out = {METRIC_ZONE_ENTRIES: 0, METRIC_ZONE_EXITS: 0, METRIC_LINE_CROSSINGS: 0, METRIC_UNIQUE_OBJECTS: 0}
        for cls, vals in by_class.items():
            if cls in classes:
                for k in out:
                    out[k] += int(vals[k])
        return out

    occupancy_rows = await occupancy(session, f)
    events_total = await _events_total(session, f)

    return {
        "scope": f.scope,
        "analysis_run_id": f.analysis_run_id,
        "from": _aware(f.start),
        "to": _aware(f.end),
        "totals": {
            "zone_entries": int(totals[METRIC_ZONE_ENTRIES]),
            "zone_exits": int(totals[METRIC_ZONE_EXITS]),
            "line_crossings": int(totals[METRIC_LINE_CROSSINGS]),
            "unique_objects": int(totals[METRIC_UNIQUE_OBJECTS]),
            "events_total": events_total,
        },
        "dwell": {
            "sessions": dwell_sessions,
            "total_seconds": round(dwell_total, 2),
            "avg_seconds": round(dwell_total / dwell_sessions, 2) if dwell_sessions else 0.0,
            "max_seconds": round(dwell_max, 2),
        },
        "occupancy": occupancy_rows,
        "peak_occupancy": int(peak_occupancy),
        "by_class": [
            {
                "object_class": cls,
                "zone_entries": int(vals[METRIC_ZONE_ENTRIES]),
                "zone_exits": int(vals[METRIC_ZONE_EXITS]),
                "line_crossings": int(vals[METRIC_LINE_CROSSINGS]),
                "unique_objects": int(vals[METRIC_UNIQUE_OBJECTS]),
            }
            for cls, vals in sorted(by_class.items())
        ],
        "vehicles": group(VEHICLE_CLASSES),
        "persons": group(frozenset({"person"})),
    }


async def _events_total(session: AsyncSession, f: MetricFilters) -> int:
    conds = []
    if f.scope == SCOPE_PRODUCTION:
        conds.append(Event.source_analysis_run_id.is_(None))
    elif f.analysis_run_id:
        conds.append(Event.source_analysis_run_id == f.analysis_run_id)
    else:
        conds.append(Event.source_analysis_run_id.is_not(None))
    if f.camera_id:
        conds.append(Event.camera_id == f.camera_id)
    if f.zone_id:
        conds.append(Event.zone_id == f.zone_id)
    start, end = _aware(f.start), _aware(f.end)
    if start is not None:
        conds.append(Event.started_at >= start)
    if end is not None:
        conds.append(Event.started_at < end)
    stmt = select(func.count(Event.id))
    if conds:
        stmt = stmt.where(and_(*conds))
    return int((await session.execute(stmt)).scalar() or 0)


async def timeseries(
    session: AsyncSession, f: MetricFilters, *, metric_type: str, bucket: str
) -> list[dict[str, Any]]:
    stmt = (
        select(
            MetricSample.bucket_start,
            func.coalesce(func.sum(MetricSample.value), 0.0),
            func.coalesce(func.sum(MetricSample.count), 0),
            func.coalesce(func.sum(MetricSample.sum_value), 0.0),
            func.max(MetricSample.max_value),
        )
        .where(MetricSample.metric_type == metric_type)
        .group_by(MetricSample.bucket_start)
        .order_by(MetricSample.bucket_start)
    )
    stmt = _apply(stmt, f, bucket=bucket)
    rows = (await session.execute(stmt)).all()
    return [
        {
            "bucket_start": _aware(bs),
            "value": _agg_value(metric_type, float(v or 0), int(c or 0), float(s or 0), mx),
            "count": int(c or 0),
        }
        for bs, v, c, s, mx in rows
    ]


async def breakdown(
    session: AsyncSession, f: MetricFilters, *, metric_type: str, by: str
) -> list[dict[str, Any]]:
    col = BREAKDOWN_DIMS[by]
    stmt = (
        select(
            col,
            func.coalesce(func.sum(MetricSample.value), 0.0),
            func.coalesce(func.sum(MetricSample.count), 0),
            func.coalesce(func.sum(MetricSample.sum_value), 0.0),
            func.max(MetricSample.max_value),
        )
        .where(MetricSample.metric_type == metric_type)
        .group_by(col)
    )
    stmt = _apply(stmt, f, bucket="hour")
    rows = (await session.execute(stmt)).all()
    items = [
        {
            "key": key or "unknown",
            "value": _agg_value(metric_type, float(v or 0), int(c or 0), float(s or 0), mx),
            "count": int(c or 0),
        }
        for key, v, c, s, mx in rows
    ]
    items.sort(key=lambda x: (-float(x["value"]), str(x["key"])))
    return items


async def occupancy(session: AsyncSession, f: MetricFilters) -> list[dict[str, Any]]:
    conds = [MetricState.scope == f.scope, MetricState.kind == "occupancy"]
    if f.analysis_run_id:
        conds.append(MetricState.analysis_run_id == f.analysis_run_id)
    if f.camera_id:
        conds.append(MetricState.camera_id == f.camera_id)
    if f.zone_id:
        conds.append(MetricState.zone_id == f.zone_id)
    rows = (await session.execute(select(MetricState).where(and_(*conds)))).scalars().all()
    out: list[dict[str, Any]] = []
    for row in rows:
        st = OccupancyState.from_json(row.value_json)
        out.append(
            {
                "camera_id": row.camera_id or "",
                "zone_id": row.zone_id or "",
                "analysis_run_id": row.analysis_run_id,
                "current": st.current,
                "peak": st.peak,
                "peak_at": st.peak_at,
                "updated_at": st.updated_at,
            }
        )
    out.sort(key=lambda x: (x["camera_id"], x["zone_id"]))
    return out
