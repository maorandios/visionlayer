"""Line-crossing state machine with hysteresis."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.domain.spatial.lines import (
    LINE_HYSTERESIS,
    crossing_direction,
    line_side,
    normalize_line_points,
)
from app.domain.zones.geometry import Point


@dataclass(frozen=True, slots=True)
class LineCrossTransition:
    line_id: str
    direction: str  # a_to_b | b_to_a
    occurrence_id: str
    point: Point


@dataclass(slots=True)
class _LineTrackState:
    last_side: float
    last_at: datetime
    last_cross_at: datetime | None = None


class LineCrossingTracker:
    """Per (camera, track, line) signed-side memory."""

    def __init__(self, *, min_cross_interval_sec: float = 0.4) -> None:
        self._states: dict[tuple[str, int, str], _LineTrackState] = {}
        self._min_cross_interval = min_cross_interval_sec

    def update(
        self,
        *,
        camera_id: str,
        track_id: int,
        line_id: str,
        points: list[list[float]],
        point: Point,
        at: datetime,
    ) -> LineCrossTransition | None:
        a, b = normalize_line_points(points)
        side = line_side(point, a, b)
        key = (camera_id, track_id, line_id)
        prev = self._states.get(key)
        if prev is None:
            self._states[key] = _LineTrackState(last_side=side, last_at=at)
            return None

        # Stay near the line — ignore jitter
        if abs(side) < LINE_HYSTERESIS:
            prev.last_at = at
            return None

        direction = crossing_direction(prev.last_side, side)
        prev.last_side = side
        prev.last_at = at
        if direction is None:
            return None

        if prev.last_cross_at is not None:
            dt = (at - prev.last_cross_at).total_seconds()
            if dt < self._min_cross_interval:
                return None

        prev.last_cross_at = at
        occ = f"cross:{camera_id}:{track_id}:{line_id}:{direction}:{at.isoformat()}"
        return LineCrossTransition(
            line_id=line_id,
            direction=direction,
            occurrence_id=occ,
            point=point,
        )

    def clear(self) -> None:
        self._states.clear()

    def clear_camera(self, camera_id: str) -> None:
        self._states = {k: v for k, v in self._states.items() if k[0] != camera_id}
