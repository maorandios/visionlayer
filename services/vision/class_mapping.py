"""Detector-native class IDs/names → VisionLayer canonical class names.

Numeric / vendor-specific IDs must never leave the vision backend.
Product Logic only sees canonical strings: person, car, truck, bus, motorcycle, bicycle.
"""

from __future__ import annotations

from detection_contract import CANONICAL_CLASSES

# COCO-80 indices used by YOLOX ONNX weights in this repo.
COCO_ID_TO_NAME: dict[int, str] = {
    0: "person",
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}

# Aliases some models emit → VisionLayer canonical.
NATIVE_NAME_ALIASES: dict[str, str] = {
    "Person": "person",
    "Bicycle": "bicycle",
    "Car": "car",
    "Motorcycle": "motorcycle",
    "Bus": "bus",
    "Truck": "truck",
    "motorbike": "motorcycle",
    "auto": "car",
}


def map_native_class_id(class_id: int) -> str | None:
    """Map detector numeric class id → canonical name, or None if unsupported."""
    name = COCO_ID_TO_NAME.get(int(class_id))
    if name is None:
        return None
    return name if name in CANONICAL_CLASSES else None


def map_native_class_name(name: str) -> str | None:
    """Map detector string label → canonical name, or None if unsupported."""
    raw = str(name).strip()
    if raw in CANONICAL_CLASSES:
        return raw
    aliased = NATIVE_NAME_ALIASES.get(raw) or NATIVE_NAME_ALIASES.get(raw.lower())
    if aliased and aliased in CANONICAL_CLASSES:
        return aliased
    return None


def require_canonical(name: str) -> str:
    mapped = map_native_class_name(name)
    if mapped is None:
        raise ValueError(f"unsupported detector class for VisionLayer: {name!r}")
    return mapped
