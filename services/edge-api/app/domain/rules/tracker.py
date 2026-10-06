"""In-memory zone presence tracking by (camera_id, track_id, zone_id)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class PresenceState:
    entered_at: datetime
    last_seen_at: datetime
    object_class: str


class ZonePresenceTracker:
    """Tracks how long a track_id has continuously been inside a zone."""

    def __init__(self) -> None:
        self._states: dict[tuple[str, int, str], PresenceState] = {}

    def update(
        self,
        *,
        camera_id: str,
        track_id: int,
        zone_id: str,
        object_class: str,
        inside: bool,
        at: datetime,
    ) -> PresenceState | None:
        key = (camera_id, track_id, zone_id)
        if inside:
            existing = self._states.get(key)
            if existing is None:
                state = PresenceState(entered_at=at, last_seen_at=at, object_class=object_class)
                self._states[key] = state
                return state
            existing.last_seen_at = at
            existing.object_class = object_class
            return existing

        self._states.pop(key, None)
        return None

    def duration_seconds(
        self,
        *,
        camera_id: str,
        track_id: int,
        zone_id: str,
        at: datetime,
    ) -> float | None:
        state = self._states.get((camera_id, track_id, zone_id))
        if state is None:
            return None
        return max(0.0, (at - state.entered_at).total_seconds())

    def clear(self) -> None:
        self._states.clear()

    def clear_camera(self, camera_id: str) -> None:
        self._states = {k: v for k, v in self._states.items() if k[0] != camera_id}
