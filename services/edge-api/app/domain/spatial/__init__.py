"""Spatial event types — intermediate layer between tracking and rules."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

SpatialKind = Literal[
    "zone_enter",
    "zone_exit",
    "zone_presence",
    "line_cross",
    "dwell_threshold_reached",
]


@dataclass(frozen=True, slots=True)
class SpatialEvent:
    kind: SpatialKind
    camera_id: str
    track_id: int
    object_class: str
    confidence: float
    timestamp: datetime
    zone_id: str | None = None
    line_id: str | None = None
    direction: str | None = None  # any | a_to_b | b_to_a
    duration_seconds: float | None = None
    point: tuple[float, float] | None = None  # normalized
    occurrence_id: str = ""  # stable dedupe key for this transition
