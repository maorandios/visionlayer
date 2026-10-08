"""Central VisionLayer detector / metric capabilities (POC: RF-DETR Large class set).

Change this module when the detector changes — API validation and UIs should
consume these lists rather than hardcoding classes elsewhere.
"""

from __future__ import annotations

from typing import Final, Literal

# Detector classes exposed to product UI (no free-form / ReID / attributes).
OBJECT_TYPES: Final[tuple[str, ...]] = (
    "person",
    "vehicle",  # logical group — not a raw detector class
    "car",
    "truck",
    "bus",
    "motorcycle",
    "bicycle",
)

ObjectType = Literal["person", "vehicle", "car", "truck", "bus", "motorcycle", "bicycle"]

# vehicle group → detector classes (bicycle intentionally excluded).
VEHICLE_CLASSES: Final[frozenset[str]] = frozenset({"car", "truck", "bus", "motorcycle"})

OBJECT_TYPE_TO_CLASSES: Final[dict[str, frozenset[str]]] = {
    "person": frozenset({"person"}),
    "vehicle": VEHICLE_CLASSES,
    "car": frozenset({"car"}),
    "truck": frozenset({"truck"}),
    "bus": frozenset({"bus"}),
    "motorcycle": frozenset({"motorcycle"}),
    "bicycle": frozenset({"bicycle"}),
}

# User-facing metric definition types (not engine sample metric_type strings).
METRIC_TYPES: Final[tuple[str, ...]] = (
    "entries",
    "exits",
    "line_crossings",
    "occupancy_current",
    "occupancy_peak",
    "dwell_avg",
    "dwell_max",
    "objects_observed",
)

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

ScopeType = Literal["camera", "zone", "line"]
DirectionType = Literal["any", "a_to_b", "b_to_a"]

# Spatial / direction requirements per metric type.
METRIC_REQUIREMENTS: Final[dict[str, dict[str, object]]] = {
    "entries": {"spatial": "line", "direction": True, "supports_camera_scope": False},
    "exits": {"spatial": "line", "direction": True, "supports_camera_scope": False},
    "line_crossings": {"spatial": "line", "direction": "optional", "supports_camera_scope": False},
    "occupancy_current": {"spatial": "zone", "direction": False, "supports_camera_scope": False},
    "occupancy_peak": {"spatial": "zone", "direction": False, "supports_camera_scope": False},
    "dwell_avg": {"spatial": "zone", "direction": False, "supports_camera_scope": False},
    "dwell_max": {"spatial": "zone", "direction": False, "supports_camera_scope": False},
    "objects_observed": {"spatial": "optional_zone", "direction": False, "supports_camera_scope": True},
}

# Map definition type → Metrics Engine sample metric_type used for reads.
ENGINE_METRIC_TYPE: Final[dict[str, str]] = {
    "entries": "line_crossings",
    "exits": "line_crossings",
    "line_crossings": "line_crossings",
    "occupancy_current": "occupancy_peak",  # live state comes from metric_state; peak sample unused for current
    "occupancy_peak": "occupancy_peak",
    "dwell_avg": "dwell",
    "dwell_max": "dwell",
    "objects_observed": "unique_objects",
}


def resolve_object_classes(object_type: str) -> list[str]:
    classes = OBJECT_TYPE_TO_CLASSES.get(object_type)
    if classes is None:
        raise ValueError(f"unsupported object_type: {object_type}")
    return sorted(classes)


def is_supported_object_type(object_type: str) -> bool:
    return object_type in OBJECT_TYPE_TO_CLASSES


def is_supported_metric_type(metric_type: str) -> bool:
    return metric_type in METRIC_REQUIREMENTS
