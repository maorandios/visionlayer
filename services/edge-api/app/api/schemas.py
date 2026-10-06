"""Pydantic API schemas for Phase 1."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

# --- Auth ---


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    username: str
    role: str


# --- Cameras ---


class CameraCreate(BaseModel):
    id: str | None = Field(default=None, min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    enabled: bool = True


class CameraUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    enabled: bool | None = None


class CameraResponse(BaseModel):
    id: str
    name: str
    location: str | None
    enabled: bool
    status: str
    created_at: datetime
    updated_at: datetime


# --- Zones ---


class ZoneCreate(BaseModel):
    id: str | None = Field(default=None, min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    kind: Literal["polygon"] = "polygon"
    points: list[list[float]] = Field(min_length=3)
    enabled: bool = True

    @field_validator("points")
    @classmethod
    def validate_points(cls, value: list[list[float]]) -> list[list[float]]:
        for point in value:
            if len(point) != 2:
                raise ValueError("each point must be [x, y]")
            x, y = point
            if not (0.0 <= float(x) <= 1.0 and 0.0 <= float(y) <= 1.0):
                raise ValueError("coordinates must be normalized to 0–1")
        return value


class ZoneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    points: list[list[float]] | None = None
    enabled: bool | None = None

    @field_validator("points")
    @classmethod
    def validate_points(cls, value: list[list[float]] | None) -> list[list[float]] | None:
        if value is None:
            return value
        for point in value:
            if len(point) != 2:
                raise ValueError("each point must be [x, y]")
            x, y = point
            if not (0.0 <= float(x) <= 1.0 and 0.0 <= float(y) <= 1.0):
                raise ValueError("coordinates must be normalized to 0–1")
        if len(value) < 3:
            raise ValueError("polygon requires at least 3 points")
        return value


class ZoneResponse(BaseModel):
    id: str
    camera_id: str
    name: str
    kind: str
    points: list[list[float]]
    enabled: bool
    created_at: datetime


# --- Rules ---


class ScheduleSchema(BaseModel):
    from_: str = Field(alias="from", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    to: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    days: list[int] | None = None
    timezone: str | None = None

    model_config = {"populate_by_name": True}


class RuleConditions(BaseModel):
    object_classes: list[str] = Field(min_length=1)
    camera_id: str | None = None
    zone_id: str | None = None
    line_id: str | None = None
    direction: Literal["any", "a_to_b", "b_to_a"] | None = "any"
    trigger: (
        Literal[
            "zone_presence",
            "zone_enter",
            "zone_exit",
            "line_cross",
            "dwell",
            "count_threshold",
        ]
        | None
    ) = None
    schedule: ScheduleSchema | None = None
    min_duration_seconds: int = Field(default=0, ge=0)
    count: int | None = Field(default=None, ge=1)
    threshold: float | None = None
    operator: Literal["gte", "gt", "lte", "lt", "eq"] | None = "gte"
    aggregation_window_seconds: int | None = Field(default=None, ge=1)
    aggregation: dict[str, Any] | None = None


class LineCreate(BaseModel):
    id: str | None = Field(default=None, min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    points: list[list[float]] = Field(min_length=2, max_length=2)
    direction: Literal["any", "a_to_b", "b_to_a"] = "any"
    label_a_to_b: str | None = Field(default=None, max_length=100)
    label_b_to_a: str | None = Field(default=None, max_length=100)
    enabled: bool = True

    @field_validator("points")
    @classmethod
    def validate_points(cls, value: list[list[float]]) -> list[list[float]]:
        if len(value) != 2:
            raise ValueError("line requires exactly 2 points")
        for point in value:
            if len(point) != 2:
                raise ValueError("each point must be [x, y]")
            x, y = point
            if not (0.0 <= float(x) <= 1.0 and 0.0 <= float(y) <= 1.0):
                raise ValueError("coordinates must be normalized to 0–1")
        return value


class LineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    points: list[list[float]] | None = None
    direction: Literal["any", "a_to_b", "b_to_a"] | None = None
    label_a_to_b: str | None = Field(default=None, max_length=100)
    label_b_to_a: str | None = Field(default=None, max_length=100)
    enabled: bool | None = None

    @field_validator("points")
    @classmethod
    def validate_points(cls, value: list[list[float]] | None) -> list[list[float]] | None:
        if value is None:
            return value
        if len(value) != 2:
            raise ValueError("line requires exactly 2 points")
        for point in value:
            if len(point) != 2:
                raise ValueError("each point must be [x, y]")
            x, y = point
            if not (0.0 <= float(x) <= 1.0 and 0.0 <= float(y) <= 1.0):
                raise ValueError("coordinates must be normalized to 0–1")
        return value


class LineResponse(BaseModel):
    id: str
    camera_id: str
    name: str
    points: list[list[float]]
    direction: str
    label_a_to_b: str | None = None
    label_b_to_a: str | None = None
    enabled: bool
    created_at: datetime


# --- Rules ---


class RuleAction(BaseModel):
    type: Literal["push_notification", "create_event"]


class RuleCreate(BaseModel):
    id: str | None = Field(default=None, min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    enabled: bool = True
    conditions: RuleConditions
    actions: list[RuleAction] = Field(min_length=1)
    cooldown_seconds: int = Field(default=0, ge=0)


class RuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    enabled: bool | None = None
    conditions: RuleConditions | None = None
    actions: list[RuleAction] | None = None
    cooldown_seconds: int | None = Field(default=None, ge=0)


class RuleResponse(BaseModel):
    id: str
    name: str
    enabled: bool
    conditions: dict[str, Any]
    actions: list[dict[str, Any]]
    cooldown_seconds: int
    last_triggered_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RuleValidateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    enabled: bool = True
    conditions: RuleConditions
    actions: list[RuleAction] = Field(min_length=1)
    cooldown_seconds: int = Field(default=0, ge=0)


class RuleValidateResponse(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)


# --- Events ---


class EventResponse(BaseModel):
    id: str
    camera_id: str
    rule_id: str | None
    type: str
    severity: str
    object_class: str | None
    track_id: int | None
    zone_id: str | None
    confidence: float | None
    started_at: datetime
    ended_at: datetime | None
    state: str
    message_he: str | None
    payload: dict[str, Any]
    created_at: datetime
    media_status: str = "none"
    trigger_timestamp_sec: float | None = None
    source_analysis_run_id: str | None = None
    has_snapshot: bool = False
    has_clip: bool = False


class EventAckResponse(BaseModel):
    id: str
    state: str


# --- Simulation ---


class SimulateDetectionRequest(BaseModel):
    camera_id: str
    class_: str = Field(alias="class")
    confidence: float = Field(default=0.95, ge=0, le=1)
    bbox: list[float] = Field(min_length=4, max_length=4)
    track_id: int | None = Field(default=1, ge=0)
    timestamp: float | None = None
    frame_size: list[int] = Field(default_factory=lambda: [1920, 1080])
    source: Literal["mock", "dev", "deepstream", "hailo"] = "mock"

    model_config = {"populate_by_name": True}


class SimulateScenarioRequest(BaseModel):
    scenario: Literal[
        "person_enter_zone",
        "person_loiter_zone",
        "person_leave_zone",
        "truck_enter_zone",
    ]
    camera_id: str
    zone_id: str
    track_id: int = Field(default=42, ge=0)
    base_timestamp: float | None = None
    duration_seconds: float = Field(default=35.0, ge=0)
    frame_size: list[int] = Field(default_factory=lambda: [1920, 1080])


class SimulateResponse(BaseModel):
    detections_published: int
    event_ids: list[str]
