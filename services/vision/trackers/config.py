"""Centralized tracker configuration for Video Test Lab."""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True, slots=True)
class TrackerConfig:
    """Development defaults for ByteTrack (tunable in one place)."""

    # Detections above this score are "high confidence" (first association stage).
    track_activation_threshold: float = 0.5
    # Detections below this are ignored entirely.
    min_confidence: float = 0.1
    # IoU matching threshold (higher = stricter). ByteTrack uses 1 - cost with thresh ~0.8.
    match_threshold: float = 0.8
    # How many frames a lost track is kept before removal (scaled by fps/30).
    lost_track_buffer: int = 30
    # New tracks need this many hits before considered confirmed (ByteTrack often uses 1–3).
    min_hits_to_activate: int = 1
    # Assumed FPS when video metadata is missing.
    default_fps: float = 25.0

    def to_dict(self) -> dict:
        return asdict(self)


DEFAULT_TRACKER_CONFIG = TrackerConfig()
