"""Polygon geometry helpers for zone membership (normalized 0–1 coords)."""

from __future__ import annotations

from collections.abc import Sequence

Point = tuple[float, float]


def bbox_bottom_center(bbox: Sequence[float]) -> Point:
    """Return pixel bottom-center of bbox [x1, y1, x2, y2]."""
    x1, _y1, x2, y2 = (float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3]))
    return ((x1 + x2) / 2.0, y2)


def normalize_point(point: Point, frame_size: Sequence[int | float]) -> Point:
    """Convert pixel point to normalized [0, 1] coordinates."""
    width = float(frame_size[0])
    height = float(frame_size[1])
    if width <= 0 or height <= 0:
        raise ValueError("frame_size must be positive")
    return (point[0] / width, point[1] / height)


def point_in_polygon(point: Point, polygon: Sequence[Sequence[float]]) -> bool:
    """Ray-casting point-in-polygon. Polygon vertices are normalized [x, y]."""
    if len(polygon) < 3:
        return False

    x, y = point
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = float(polygon[i][0]), float(polygon[i][1])
        xj, yj = float(polygon[j][0]), float(polygon[j][1])
        intersects = ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def detection_in_zone(
    bbox: Sequence[float],
    frame_size: Sequence[int | float],
    polygon: Sequence[Sequence[float]],
) -> bool:
    """True if detection bottom-center (normalized) is inside zone polygon."""
    pixel = bbox_bottom_center(bbox)
    normalized = normalize_point(pixel, frame_size)
    return point_in_polygon(normalized, polygon)
