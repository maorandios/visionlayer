"""Unit tests for polygon geometry."""

from __future__ import annotations

from app.domain.zones.geometry import (
    bbox_bottom_center,
    detection_in_zone,
    normalize_point,
    point_in_polygon,
)

SQUARE = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]


def test_point_inside_square() -> None:
    assert point_in_polygon((0.5, 0.5), SQUARE) is True


def test_point_outside_square() -> None:
    assert point_in_polygon((0.05, 0.05), SQUARE) is False


def test_bbox_bottom_center() -> None:
    assert bbox_bottom_center([100, 50, 200, 150]) == (150.0, 150.0)


def test_normalize_point() -> None:
    assert normalize_point((960, 540), [1920, 1080]) == (0.5, 0.5)


def test_detection_in_zone_uses_bottom_center() -> None:
    # Bottom center at (960, 600) -> (0.5, ~0.556) inside square
    bbox = [860, 400, 1060, 600]
    assert detection_in_zone(bbox, [1920, 1080], SQUARE) is True


def test_detection_outside_zone() -> None:
    bbox = [10, 10, 40, 40]
    assert detection_in_zone(bbox, [1920, 1080], SQUARE) is False
