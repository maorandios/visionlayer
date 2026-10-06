"""Typed response contracts for the Metrics API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MetricScope = Literal["production", "video_lab"]
MetricType = Literal[
    "zone_entries",
    "zone_exits",
    "line_crossings",
    "unique_objects",
    "dwell",
    "occupancy_peak",
]
MetricBucket = Literal["hour", "day"]
BreakdownBy = Literal["camera", "zone", "line", "object_class", "direction"]


class MetricTotals(BaseModel):
    zone_entries: int
    zone_exits: int
    line_crossings: int
    unique_objects: int
    events_total: int


class DwellSummary(BaseModel):
    sessions: int
    total_seconds: float
    avg_seconds: float
    max_seconds: float


class OccupancyItem(BaseModel):
    camera_id: str
    zone_id: str
    analysis_run_id: str | None = None
    current: int
    peak: int
    peak_at: str | None = None
    updated_at: str | None = None


class ClassTotals(BaseModel):
    object_class: str
    zone_entries: int
    zone_exits: int
    line_crossings: int
    unique_objects: int


class GroupTotals(BaseModel):
    zone_entries: int
    zone_exits: int
    line_crossings: int
    unique_objects: int


class MetricsSummaryResponse(BaseModel):
    scope: MetricScope
    analysis_run_id: str | None = None
    from_: datetime | None = Field(default=None, alias="from")
    to: datetime | None = None
    totals: MetricTotals
    dwell: DwellSummary
    occupancy: list[OccupancyItem]
    peak_occupancy: int
    by_class: list[ClassTotals]
    vehicles: GroupTotals
    persons: GroupTotals

    model_config = {"populate_by_name": True}


class TimeseriesPoint(BaseModel):
    bucket_start: datetime
    value: float
    count: int


class MetricsTimeseriesResponse(BaseModel):
    scope: MetricScope
    metric_type: MetricType
    bucket: MetricBucket
    points: list[TimeseriesPoint]


class BreakdownItem(BaseModel):
    key: str
    value: float
    count: int


class MetricsBreakdownResponse(BaseModel):
    scope: MetricScope
    metric_type: MetricType
    by: BreakdownBy
    items: list[BreakdownItem]
