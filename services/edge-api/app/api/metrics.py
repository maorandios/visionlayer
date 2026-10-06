"""Metrics API — summary / timeseries / breakdown over persistent metric samples."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.api.metrics_schemas import (
    BreakdownBy,
    MetricBucket,
    MetricsBreakdownResponse,
    MetricScope,
    MetricsSummaryResponse,
    MetricsTimeseriesResponse,
    MetricType,
)
from app.core.deps import CurrentUser, get_current_user
from app.domain.metrics import queries
from app.domain.metrics.queries import MetricFilters

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])


def _filters(
    scope: MetricScope,
    analysis_run_id: str | None,
    from_: datetime | None,
    to: datetime | None,
    camera_id: str | None,
    zone_id: str | None,
    line_id: str | None,
    object_class: str | None,
    direction: str | None,
) -> MetricFilters:
    return MetricFilters(
        scope=scope,
        analysis_run_id=analysis_run_id or None,
        start=from_,
        end=to,
        camera_id=camera_id or None,
        zone_id=zone_id or None,
        line_id=line_id or None,
        object_class=object_class or None,
        direction=direction or None,
    )


@router.get("/summary", response_model=MetricsSummaryResponse, response_model_by_alias=True)
async def metrics_summary(
    scope: MetricScope = Query(default="production"),
    analysis_run_id: str | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    camera_id: str | None = Query(default=None),
    zone_id: str | None = Query(default=None),
    line_id: str | None = Query(default=None),
    object_class: str | None = Query(default=None, description="class or group: vehicle | person"),
    direction: str | None = Query(default=None),
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MetricsSummaryResponse:
    f = _filters(scope, analysis_run_id, from_, to, camera_id, zone_id, line_id, object_class, direction)
    data = await queries.summary(db, f)
    return MetricsSummaryResponse.model_validate(data)


@router.get("/timeseries", response_model=MetricsTimeseriesResponse)
async def metrics_timeseries(
    metric_type: MetricType = Query(default="zone_entries"),
    bucket: MetricBucket = Query(default="hour"),
    scope: MetricScope = Query(default="production"),
    analysis_run_id: str | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    camera_id: str | None = Query(default=None),
    zone_id: str | None = Query(default=None),
    line_id: str | None = Query(default=None),
    object_class: str | None = Query(default=None),
    direction: str | None = Query(default=None),
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MetricsTimeseriesResponse:
    f = _filters(scope, analysis_run_id, from_, to, camera_id, zone_id, line_id, object_class, direction)
    points = await queries.timeseries(db, f, metric_type=metric_type, bucket=bucket)
    return MetricsTimeseriesResponse(scope=scope, metric_type=metric_type, bucket=bucket, points=points)


@router.get("/breakdown", response_model=MetricsBreakdownResponse)
async def metrics_breakdown(
    metric_type: MetricType = Query(default="zone_entries"),
    by: BreakdownBy = Query(default="object_class"),
    scope: MetricScope = Query(default="production"),
    analysis_run_id: str | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    camera_id: str | None = Query(default=None),
    zone_id: str | None = Query(default=None),
    line_id: str | None = Query(default=None),
    object_class: str | None = Query(default=None),
    direction: str | None = Query(default=None),
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MetricsBreakdownResponse:
    f = _filters(scope, analysis_run_id, from_, to, camera_id, zone_id, line_id, object_class, direction)
    items = await queries.breakdown(db, f, metric_type=metric_type, by=by)
    return MetricsBreakdownResponse(scope=scope, metric_type=metric_type, by=by, items=items)
