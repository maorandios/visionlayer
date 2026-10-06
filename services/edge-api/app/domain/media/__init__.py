"""Event media generation (snapshots + clips) — post-analysis only, no vision pipeline."""

from app.domain.media.service import generate_media_for_video_lab_events

__all__ = ["generate_media_for_video_lab_events"]
