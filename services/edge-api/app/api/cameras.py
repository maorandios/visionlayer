"""Camera CRUD endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.adapters.models import AuditLog, Camera
from app.api.schemas import CameraCreate, CameraResponse, CameraUpdate
from app.core.deps import CurrentUser, get_current_user
from app.core.errors import NotFoundError, ValidationAppError
from app.core.ids import new_id

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
