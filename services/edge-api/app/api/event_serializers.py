"""Serialize ORM events for API and WebSocket payloads."""

from __future__ import annotations

from app.adapters.models import Event
from app.api.schemas import EventResponse


def event_to_payload(event: Event) -> dict:
    snap = bool(event.snapshot_path or event.thumbnail_path)
    clip = bool(event.clip_path)
    model = EventResponse(
        id=event.id,
        camera_id=event.camera_id,
        rule_id=event.rule_id,
        type=event.type,
        severity=event.severity,
        object_class=event.object_class,
        track_id=event.track_id,
        zone_id=event.zone_id,
        confidence=event.confidence,
        started_at=event.started_at,
        ended_at=event.ended_at,
        state=event.state,
        message_he=event.message_he,
        payload=dict(event.payload_json or {}),
        created_at=event.created_at,
        media_status=event.media_status or "none",
        trigger_timestamp_sec=event.trigger_timestamp_sec,
        source_analysis_run_id=event.source_analysis_run_id,
        has_snapshot=snap,
        has_clip=clip,
    )
    return model.model_dump(mode="json")
