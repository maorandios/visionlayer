"""Simulation API — publishes unified detections through the real Event Bus."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.adapters.models import Zone
from app.api.schemas import (
    SimulateDetectionRequest,
    SimulateResponse,
    SimulateScenarioRequest,
)
from app.bus.event_bus import bus
from app.core.config import get_settings
from app.core.deps import CurrentUser, get_current_user
from app.core.errors import AppError, NotFoundError, ValidationAppError
from app.domain.pipeline.detection_pipeline import TOPIC_DETECTIONS

router = APIRouter(prefix="/api/v1/simulate", tags=["simulate"])


def _build_detection(
    *,
    camera_id: str,
    object_class: str,
    bbox: list[float],
    track_id: int | None,
    timestamp: float,
    frame_size: list[int],
    confidence: float = 0.95,
    source: str = "mock",
) -> dict[str, Any]:
    return {
        "type": "detection",
        "schema_version": "1.0",
        "camera_id": camera_id,
        "class": object_class,
        "confidence": confidence,
        "bbox": bbox,
        "track_id": track_id,
        "timestamp": timestamp,
        "frame_size": frame_size,
        "source": source,
    }


def _zone_center_bbox(points: list[list[float]], frame_size: list[int]) -> list[float]:
    """Build a small pixel bbox whose bottom-center lies inside the zone."""
    xs = [float(p[0]) for p in points]
    ys = [float(p[1]) for p in points]
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    w, h = float(frame_size[0]), float(frame_size[1])
    px, py = cx * w, cy * h
    # Bottom-center of this bbox is (px, py + 20) approximately — keep center as bottom
    half = 20.0
    return [px - half, py - 40.0, px + half, py]


def _outside_bbox(frame_size: list[int]) -> list[float]:
    w, h = float(frame_size[0]), float(frame_size[1])
    return [w * 0.02, h * 0.02, w * 0.05, h * 0.05]


async def _publish_and_collect(request: Request, detection: dict[str, Any]) -> list[str]:
    request.app.state.last_batch_event_ids = []
    await bus.publish(TOPIC_DETECTIONS, detection)
    return list(getattr(request.app.state, "last_batch_event_ids", []) or [])


@router.post("/detection", response_model=SimulateResponse)
async def simulate_detection(
    body: SimulateDetectionRequest,
    request: Request,
    _user: CurrentUser = Depends(get_current_user),
) -> SimulateResponse:
    settings = get_settings()
    if not settings.is_feature_enabled("simulate_detections"):
        raise AppError("סימולציה כבויה", code="feature_disabled", status_code=403)

    ts = body.timestamp if body.timestamp is not None else time.time()
    detection = _build_detection(
        camera_id=body.camera_id,
        object_class=body.class_,
        bbox=body.bbox,
        track_id=body.track_id,
        timestamp=ts,
        frame_size=body.frame_size,
        confidence=body.confidence,
        source=body.source,
    )
    event_ids = await _publish_and_collect(request, detection)
    return SimulateResponse(detections_published=1, event_ids=event_ids)


@router.post("/scenario", response_model=SimulateResponse)
async def simulate_scenario(
    body: SimulateScenarioRequest,
    request: Request,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SimulateResponse:
    settings = get_settings()
    if not settings.is_feature_enabled("simulate_detections"):
        raise AppError("סימולציה כבויה", code="feature_disabled", status_code=403)

    zone = await db.get(Zone, body.zone_id)
    if zone is None or zone.camera_id != body.camera_id:
        raise NotFoundError("אזור לא נמצא עבור המצלמה")

    base_ts = body.base_timestamp if body.base_timestamp is not None else time.time()
    inside_bbox = _zone_center_bbox(list(zone.points_json), body.frame_size)
    outside_bbox = _outside_bbox(body.frame_size)

    detections: list[dict[str, Any]] = []

    if body.scenario == "person_enter_zone":
        detections.append(
            _build_detection(
                camera_id=body.camera_id,
                object_class="person",
                bbox=inside_bbox,
                track_id=body.track_id,
                timestamp=base_ts,
                frame_size=body.frame_size,
            )
        )
    elif body.scenario == "person_leave_zone":
        detections.append(
            _build_detection(
                camera_id=body.camera_id,
                object_class="person",
                bbox=inside_bbox,
                track_id=body.track_id,
                timestamp=base_ts,
                frame_size=body.frame_size,
            )
        )
        detections.append(
            _build_detection(
                camera_id=body.camera_id,
                object_class="person",
                bbox=outside_bbox,
                track_id=body.track_id,
                timestamp=base_ts + 1.0,
                frame_size=body.frame_size,
            )
        )
    elif body.scenario == "person_loiter_zone":
        # Enter then stay until duration threshold
        steps = max(2, int(body.duration_seconds) + 1)
        for i in range(steps):
            detections.append(
                _build_detection(
                    camera_id=body.camera_id,
                    object_class="person",
                    bbox=inside_bbox,
                    track_id=body.track_id,
                    timestamp=base_ts + float(i),
                    frame_size=body.frame_size,
                )
            )
    elif body.scenario == "truck_enter_zone":
        detections.append(
            _build_detection(
                camera_id=body.camera_id,
                object_class="truck",
                bbox=inside_bbox,
                track_id=body.track_id,
                timestamp=base_ts,
                frame_size=body.frame_size,
            )
        )
    else:
        raise ValidationAppError(f"תרחיש לא נתמך: {body.scenario}")

    all_event_ids: list[str] = []
    for det in detections:
        ids = await _publish_and_collect(request, det)
        all_event_ids.extend(ids)

    return SimulateResponse(
        detections_published=len(detections),
        event_ids=all_event_ids,
    )
