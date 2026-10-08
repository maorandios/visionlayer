"""Camera CRUD endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.adapters.models import AuditLog, Camera, Line, MetricDefinition, Rule, VideoLabJob, Zone
from app.api.schemas import CameraCreate, CameraResponse, CameraUpdate
from app.api.video_lab import start_analysis_for_asset
from app.core.config import get_settings
from app.core.deps import CurrentUser, get_current_user
from app.core.errors import AppError, NotFoundError, ValidationAppError
from app.core.ids import new_id
from app.domain.video_lab import benchmark_store
from app.domain.video_lab import service as video_lab

router = APIRouter(prefix="/api/v1/cameras", tags=["cameras"])


def _to_response(camera: Camera) -> CameraResponse:
    return CameraResponse(
        id=camera.id,
        name=camera.name,
        location=camera.location,
        enabled=camera.enabled,
        status=camera.status,
        created_at=camera.created_at,
        updated_at=camera.updated_at,
    )


async def _audit(
    db: AsyncSession,
    *,
    actor: str,
    action: str,
    entity_id: str,
    payload: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            actor=actor,
            action=action,
            entity="camera",
            entity_id=entity_id,
            payload_json=payload,
        )
    )


@router.get("", response_model=list[CameraResponse])
async def list_cameras(
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CameraResponse]:
    result = await db.execute(select(Camera).order_by(Camera.created_at.desc()))
    return [_to_response(c) for c in result.scalars().all()]


@router.post("", response_model=CameraResponse, status_code=201)
async def create_camera(
    body: CameraCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    camera_id = body.id or new_id("cam")
    if await db.get(Camera, camera_id) is not None:
        raise ValidationAppError(f"מצלמה עם מזהה {camera_id} כבר קיימת")

    now = datetime.now(UTC)
    camera = Camera(
        id=camera_id,
        name=body.name,
        location=body.location,
        enabled=body.enabled,
        status="unknown",
        created_at=now,
        updated_at=now,
    )
    db.add(camera)
    await _audit(db, actor=user.username, action="create", entity_id=camera.id, payload={"name": body.name})
    await db.commit()
    await db.refresh(camera)
    return _to_response(camera)


@router.get("/{camera_id}", response_model=CameraResponse)
async def get_camera(
    camera_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")
    return _to_response(camera)


@router.get("/{camera_id}/snapshot")
async def get_camera_snapshot(
    camera_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    camera = await db.get(Camera, camera_id)
    if camera is None or not camera.snapshot_path:
        raise NotFoundError("תצוגה מקדימה לא נמצאה")
    path = Path(camera.snapshot_path)
    if not path.is_file():
        raise NotFoundError("תצוגה מקדימה לא נמצאה")
    return FileResponse(path, media_type="image/jpeg")


@router.patch("/{camera_id}", response_model=CameraResponse)
async def update_camera(
    camera_id: str,
    body: CameraUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")
    if body.name is not None:
        camera.name = body.name
    if body.location is not None:
        camera.location = body.location
    if body.enabled is not None:
        camera.enabled = body.enabled
    camera.updated_at = datetime.now(UTC)
    await _audit(db, actor=user.username, action="update", entity_id=camera.id)
    await db.commit()
    await db.refresh(camera)
    return _to_response(camera)


@router.delete("/{camera_id}", status_code=204)
async def delete_camera(
    camera_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")
    await _audit(db, actor=user.username, action="delete", entity_id=camera.id)
    await db.delete(camera)
    await db.commit()


@router.post("/{camera_id}/enable", response_model=CameraResponse)
async def enable_camera(
    camera_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")
    camera.enabled = True
    camera.updated_at = datetime.now(UTC)
    await _audit(db, actor=user.username, action="enable", entity_id=camera.id)
    await db.commit()
    await db.refresh(camera)
    return _to_response(camera)


@router.post("/{camera_id}/disable", response_model=CameraResponse)
async def disable_camera(
    camera_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")
    camera.enabled = False
    camera.updated_at = datetime.now(UTC)
    await _audit(db, actor=user.username, action="disable", entity_id=camera.id)
    await db.commit()
    await db.refresh(camera)
    return _to_response(camera)


def _video_lab_enabled() -> bool:
    settings = get_settings()
    return settings.is_feature_enabled("video_lab") and settings.environment.lower() in {
        "development",
        "dev",
        "local",
        "test",
    }


async def _active_job_for_asset(db: AsyncSession, asset_id: str) -> VideoLabJob | None:
    result = await db.execute(
        select(VideoLabJob)
        .where(VideoLabJob.asset_id == asset_id, VideoLabJob.status == "running")
        .order_by(VideoLabJob.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _latest_job_for_asset(db: AsyncSession, asset_id: str) -> VideoLabJob | None:
    result = await db.execute(
        select(VideoLabJob)
        .where(VideoLabJob.asset_id == asset_id)
        .order_by(VideoLabJob.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _config_changed_since(db: AsyncSession, camera_id: str, since: datetime) -> bool:
    """True if Rules / Metrics / zones / lines changed after the given run time."""
    # Rules scoped to this camera (or global camera_id null — skip those for simplicity)
    rules = await db.execute(select(Rule))
    for rule in rules.scalars().all():
        conditions = dict(rule.conditions_json or {})
        if conditions.get("camera_id") == camera_id and rule.updated_at and rule.updated_at > since:
            return True
    metrics = await db.execute(
        select(MetricDefinition).where(MetricDefinition.camera_id == camera_id)
    )
    for md in metrics.scalars().all():
        if md.updated_at and md.updated_at > since:
            return True
        if md.created_at and md.created_at > since:
            return True
    zones = await db.execute(select(Zone).where(Zone.camera_id == camera_id))
    for z in zones.scalars().all():
        # Zone model may only have created_at — treat create as change
        created = getattr(z, "created_at", None)
        if created and created > since:
            return True
    lines = await db.execute(select(Line).where(Line.camera_id == camera_id))
    for ln in lines.scalars().all():
        created = getattr(ln, "created_at", None)
        if created and created > since:
            return True
    return False


async def _camera_has_rules_or_metrics(db: AsyncSession, camera_id: str) -> bool:
    metrics = await db.execute(
        select(MetricDefinition).where(
            MetricDefinition.camera_id == camera_id,
            MetricDefinition.enabled.is_(True),
        )
    )
    if metrics.scalars().first() is not None:
        return True
    rules = await db.execute(select(Rule).where(Rule.enabled.is_(True)))
    for rule in rules.scalars().all():
        conditions = dict(rule.conditions_json or {})
        if conditions.get("camera_id") == camera_id:
            return True
    return False


@router.post("/{camera_id}/ai-test")
async def start_camera_ai_test(
    camera_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Start a full-video AI Test for a test-video-backed camera (reuses Video Lab pipeline)."""
    if not _video_lab_enabled():
        raise AppError("בדיקת AI זמינה רק במצב פיתוח", code="dev_only", status_code=403)

    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")

    asset = await video_lab.require_analyzable_asset(db, camera_id)

    if not await _camera_has_rules_or_metrics(db, camera_id):
        raise ValidationAppError(
            "עדיין לא הוגדרו מדדים או חוקים. הוסיפו לפחות מדד או חוק כדי לבדוק את ניתוח ה־AI."
        )

    active = await _active_job_for_asset(db, asset.id)
    if active is not None:
        raise ValidationAppError("בדיקת AI כבר מתבצעת למצלמה זו. המתינו לסיומה.")

    # Manual AI Test always uses correctness/debug mode (stride=1, lower threshold, full traces).
    payload = await start_analysis_for_asset(
        request=request,
        db=db,
        asset_id=asset.id,
        wait=False,
        debug_mode=True,
    )
    await _audit(
        db,
        actor=user.username,
        action="ai_test",
        entity_id=camera_id,
        payload={"job_id": payload.get("id"), "debug_mode": True},
    )
    await db.commit()
    return {
        "run_id": payload.get("id"),
        "job_id": payload.get("id"),
        "status": payload.get("status"),
        "asset_id": asset.id,
        "progress": payload.get("progress"),
        "debug_mode": True,
        "mode_he": "מצב בדיקת דיוק",
    }


@router.get("/{camera_id}/ai-test")
async def get_camera_ai_test_status(
    camera_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Current AI Test status + latest successful run for camera-scoped Activity/Events."""
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")

    asset = await video_lab.get_asset_by_camera_id(db, camera_id)
    supports = asset is not None and Path(asset.stored_path).is_file() if asset else False

    active_job = None
    latest_job = None
    if asset is not None:
        running = await _active_job_for_asset(db, asset.id)
        if running is not None:
            active_job = video_lab.job_to_dict(running)
        latest_job_row = await _latest_job_for_asset(db, asset.id)
        if latest_job_row is not None:
            latest_job = video_lab.job_to_dict(latest_job_row)

    latest_run = await benchmark_store.latest_successful_run_for_camera(db, camera_id)
    latest_successful = None
    config_changed = False
    if latest_run is not None:
        latest_successful = {
            "id": latest_run.id,
            "analyzed_at": latest_run.analyzed_at.isoformat() if latest_run.analyzed_at else None,
            "events_total": latest_run.events_total,
            "analysis_time_seconds": latest_run.analysis_time_seconds,
            "video_duration_sec": latest_run.video_duration_sec,
            "status": latest_run.status,
        }
        if latest_run.analyzed_at is not None:
            config_changed = await _config_changed_since(db, camera_id, latest_run.analyzed_at)

    has_config = await _camera_has_rules_or_metrics(db, camera_id)

    return {
        "supports_manual_analysis": supports,
        "asset_id": asset.id if asset else None,
        "has_rules_or_metrics": has_config,
        "active_job": active_job,
        "latest_job": latest_job,
        "latest_successful_run": latest_successful,
        "config_changed_since_last_run": config_changed,
    }
