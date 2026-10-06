"""Generate snapshot + clip for Video Lab events after analysis completes."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import cv2

from app.adapters.models import Event
from app.core.config import get_settings
from app.domain.media.clip import CLIP_POST_SEC, CLIP_PRE_SEC, extract_event_clip
from app.domain.media.frame_selection import (
    observations_by_track,
    pick_representative_observation,
)
from app.domain.media.paths import clip_file, relative_media_path, snapshot_file
from app.domain.video_lab.snapshots import apply_box_label, class_he, read_frame_at_index

logger = logging.getLogger(__name__)


def _trigger_sec_for_event(event: Event, base_unix_ts: float) -> float | None:
    payload = event.payload_json or {}
    if isinstance(payload.get("video_timestamp_sec"), (int, float)):
        return float(payload["video_timestamp_sec"])
    det = payload.get("detection")
    if isinstance(det, dict) and "timestamp" in det:
        return float(det["timestamp"]) - float(base_unix_ts)
    if event.started_at is not None:
        from datetime import UTC

        started = event.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        return float(started.timestamp() - base_unix_ts)
    return event.trigger_timestamp_sec


def _gallery_card_for_track(
    track_gallery: list[dict[str, Any]] | None,
    track_id: int,
) -> dict[str, Any] | None:
    if not track_gallery:
        return None
    for card in track_gallery:
        if int(card.get("track_id", -1)) == track_id:
            return card
    return None


def generate_media_for_video_lab_events(
    events: list[Event],
    *,
    video_path: Path | str,
    detections: list[dict[str, Any]],
    base_unix_ts: float,
    video_duration_sec: float,
    analysis_run_id: str,
    track_gallery: list[dict[str, Any]] | None = None,
) -> None:
    """Write snapshot.jpg (+ optional clip.mp4) per event. Updates ORM rows in place."""
    if not events:
        return

    settings = get_settings()
    show_track_id = settings.environment.lower() in {"development", "dev", "local", "test"}

    by_track = observations_by_track(detections, base_unix_ts=base_unix_ts)
    video = Path(video_path)
    if not video.is_file():
        for event in events:
            event.media_status = "failed"
            event.source_analysis_run_id = analysis_run_id
        logger.warning("event_media_skipped reason=missing_video count=%s", len(events))
        return

    # Sort by frame index to minimize VideoCapture seeks
    work: list[tuple[Event, int, dict[str, Any]]] = []
    for event in events:
        tid = event.track_id
        trigger = _trigger_sec_for_event(event, base_unix_ts)
        if tid is None or trigger is None:
            event.media_status = "unavailable"
            event.source_analysis_run_id = analysis_run_id
            if trigger is not None:
                event.trigger_timestamp_sec = trigger
            continue

        obs = pick_representative_observation(by_track.get(int(tid), []), trigger_sec=trigger)
        card = _gallery_card_for_track(track_gallery, int(tid))
        if obs is None and card:
            obs_meta = {
                "frame_index": int(card.get("frame_index") or 0),
                "bbox": list(card.get("bbox") or [0, 0, 0, 0]),
                "confidence": float(card.get("confidence") or 0),
                "object_class": str(card.get("class") or event.object_class or "unknown"),
            }
        elif obs is None:
            event.media_status = "failed"
            event.source_analysis_run_id = analysis_run_id
            event.trigger_timestamp_sec = trigger
            continue
        else:
            obs_meta = {
                "frame_index": obs.frame_index,
                "bbox": obs.bbox,
                "confidence": obs.confidence,
                "object_class": obs.object_class,
            }

        event.trigger_timestamp_sec = trigger
        event.source_analysis_run_id = analysis_run_id
        work.append((event, int(obs_meta["frame_index"]), obs_meta))

    work.sort(key=lambda row: row[1])

    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        for event, _, _ in work:
            event.media_status = "failed"
        logger.warning("event_media_open_failed")
        return

    try:
        for event, frame_index, meta in work:
            snap_ok = False
            clip_ok = False
            out_snap = snapshot_file(event.id)
            out_snap.parent.mkdir(parents=True, exist_ok=True)
            frame = read_frame_at_index(cap, frame_index)
            if frame is not None:
                cls = str(meta["object_class"])
                conf_pct = round(float(meta["confidence"]) * 100)
                label = class_he(cls)
                if show_track_id and event.track_id is not None:
                    label = f"{label} #{event.track_id} {conf_pct}%"
                else:
                    label = f"{label} {conf_pct}%"
                annotated = frame.copy()
                apply_box_label(
                    annotated,
                    bbox=list(meta["bbox"]),
                    label=label,
                    class_name=cls,
                )
                snap_ok = bool(
                    cv2.imwrite(str(out_snap), annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
                )

            if snap_ok:
                rel = relative_media_path(event.id, "snapshot.jpg")
                event.snapshot_path = rel
                event.thumbnail_path = rel

            trigger = float(event.trigger_timestamp_sec or 0)
            clip_ok = extract_event_clip(
                video_path=video,
                out_path=clip_file(event.id),
                trigger_sec=trigger,
                video_duration_sec=video_duration_sec,
                pre_sec=CLIP_PRE_SEC,
                post_sec=CLIP_POST_SEC,
            )
            if clip_ok:
                event.clip_path = relative_media_path(event.id, "clip.mp4")

            if snap_ok and clip_ok:
                event.media_status = "complete"
            elif snap_ok:
                event.media_status = "snapshot_only"
            else:
                event.media_status = "failed"

            logger.info(
                "event_media_written event=%s status=%s snapshot=%s clip=%s trigger=%.3f",
                event.id,
                event.media_status,
                snap_ok,
                clip_ok,
                trigger,
            )
    finally:
        cap.release()
