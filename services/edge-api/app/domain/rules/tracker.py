"""In-memory zone presence tracking with enter/exit/dwell transitions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class PresenceState:
    entered_at: datetime
    last_seen_at: datetime
    object_class: str
    dwell_fired: bool = False


@dataclass(frozen=True, slots=True)
class ZoneTransition:
    kind: str  # zone_enter | zone_exit | zone_presence | dwell_threshold_reached
    zone_id: str
    duration_seconds: float
    entered_at: datetime
    occurrence_id: str


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
        dwell_threshold_sec: float | None = None,
    ) -> list[ZoneTransition]:
        """Update presence and return spatial transitions for this frame."""
        key = (camera_id, track_id, zone_id)
        events: list[ZoneTransition] = []

        if inside:
            existing = self._states.get(key)
            if existing is None:
                state = PresenceState(
                    entered_at=at, last_seen_at=at, object_class=object_class, dwell_fired=False
                )
                self._states[key] = state
                occ = f"enter:{camera_id}:{track_id}:{zone_id}:{at.isoformat()}"
                events.append(
                    ZoneTransition(
                        kind="zone_enter",
                        zone_id=zone_id,
                        duration_seconds=0.0,
                        entered_at=at,
                        occurrence_id=occ,
                    )
                )
            else:
                existing.last_seen_at = at
                existing.object_class = object_class

            state = self._states[key]
            duration = max(0.0, (at - state.entered_at).total_seconds())
            events.append(
                ZoneTransition(
                    kind="zone_presence",
                    zone_id=zone_id,
                    duration_seconds=duration,
                    entered_at=state.entered_at,
                    occurrence_id=f"presence:{camera_id}:{track_id}:{zone_id}",
                )
            )
            if (
                dwell_threshold_sec is not None
                and dwell_threshold_sec > 0
                and duration >= dwell_threshold_sec
                and not state.dwell_fired
            ):
                state.dwell_fired = True
                occ = (
                    f"dwell:{camera_id}:{track_id}:{zone_id}:"
                    f"{dwell_threshold_sec}:{state.entered_at.isoformat()}"
                )
                events.append(
                    ZoneTransition(
                        kind="dwell_threshold_reached",
                        zone_id=zone_id,
                        duration_seconds=duration,
                        entered_at=state.entered_at,
                        occurrence_id=occ,
                    )
                )
            return events

        # exit
        existing = self._states.pop(key, None)
        if existing is not None:
            duration = max(0.0, (at - existing.entered_at).total_seconds())
            occ = f"exit:{camera_id}:{track_id}:{zone_id}:{at.isoformat()}"
            events.append(
                ZoneTransition(
                    kind="zone_exit",
                    zone_id=zone_id,
                    duration_seconds=duration,
                    entered_at=existing.entered_at,
                    occurrence_id=occ,
                )
            )
        return events

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
