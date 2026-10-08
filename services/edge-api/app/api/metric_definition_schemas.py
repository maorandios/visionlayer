"""Pydantic schemas for MetricDefinition CRUD."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MetricDefType = Literal[
    "entries",
    "exits",
    "line_crossings",
    "occupancy_current",
    "occupancy_peak",
    "dwell_avg",
    "dwell_max",
    "objects_observed",
]
ObjectType = Literal["person", "vehicle", "car", "truck", "bus", "motorcycle", "bicycle"]
ScopeType = Literal["camera", "zone", "line"]
DirectionType = Literal["any", "a_to_b", "b_to_a"]


class MetricDefinitionCreate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    metric_type: MetricDefType
    object_type: ObjectType
    scope_type: ScopeType = "camera"
    zone_id: str | None = None
    line_id: str | None = None
    direction: DirectionType | None = None
    enabled: bool = True
    id: str | None = None


class MetricDefinitionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    metric_type: MetricDefType | None = None
    object_type: ObjectType | None = None
    scope_type: ScopeType | None = None
    zone_id: str | None = None
    line_id: str | None = None
    direction: DirectionType | None = None
    enabled: bool | None = None
    # Allow clearing spatial refs explicitly
    clear_zone: bool = False
    clear_line: bool = False


class MetricDefinitionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    camera_id: str
    name: str
    metric_type: str
    object_type: str
    object_classes: list[str]
    scope_type: str
    zone_id: str | None = None
    line_id: str | None = None
    direction: str | None = None
    enabled: bool
    created_at: datetime
    updated_at: datetime
    engine_metric_type: str | None = None
    value_field: str | None = None
