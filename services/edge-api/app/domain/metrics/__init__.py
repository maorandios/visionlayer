"""Persistent Metrics Engine — spatial events → metric samples."""

from app.domain.metrics.engine import (
    BUCKETS,
    METRIC_DWELL,
    METRIC_LINE_CROSSINGS,
    METRIC_OCCUPANCY_PEAK,
    METRIC_UNIQUE_OBJECTS,
    METRIC_ZONE_ENTRIES,
    METRIC_ZONE_EXITS,
    SCOPE_PRODUCTION,
    SCOPE_VIDEO_LAB,
    VEHICLE_CLASSES,
    MetricsContext,
    MetricsEngine,
    TrackObservation,
)

__all__ = [
    "BUCKETS",
    "METRIC_DWELL",
    "METRIC_LINE_CROSSINGS",
    "METRIC_OCCUPANCY_PEAK",
    "METRIC_UNIQUE_OBJECTS",
    "METRIC_ZONE_ENTRIES",
    "METRIC_ZONE_EXITS",
    "SCOPE_PRODUCTION",
    "SCOPE_VIDEO_LAB",
    "VEHICLE_CLASSES",
    "MetricsContext",
    "MetricsEngine",
    "TrackObservation",
]
