"""Line crossing geometry with signed-side hysteresis."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.zones.geometry import Point, bbox_bottom_center, normalize_point

# Minimum |side| change to count as a real crossing (normalized units ≈ pixels/frame)
LINE_HYSTERESIS = 0.008


def line_side(point: Point, a: Point, b: Point) -> float:
    """Signed side of point relative to directed segment a→b. >0 left, <0 right."""
    ax, ay = a
    bx, by = b
    px, py = point
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax)


def normalize_line_points(points: Sequence[Sequence[float]]) -> tuple[Point, Point]:
    if len(points) < 2:
        raise ValueError("line requires two points")
    a = (float(points[0][0]), float(points[0][1]))
    b = (float(points[1][0]), float(points[1][1]))
    return a, b


def detection_point_normalized(
    bbox: Sequence[float],
    frame_size: Sequence[int | float],
) -> Point:
    return normalize_point(bbox_bottom_center(bbox), frame_size)


def crossing_direction(prev_side: float, curr_side: float) -> str | None:
    """Return a_to_b or b_to_a when signs flip across hysteresis band."""
    if abs(prev_side) < LINE_HYSTERESIS or abs(curr_side) < LINE_HYSTERESIS:
        return None
    if prev_side > 0 and curr_side < 0:
        return "a_to_b"
    if prev_side < 0 and curr_side > 0:
        return "b_to_a"
    return None


def direction_matches(actual: str, required: str | None) -> bool:
    want = (required or "any").lower()
    if want in {"", "any"}:
        return True
    return actual == want
