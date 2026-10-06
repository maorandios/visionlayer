"""Zone CRUD endpoints."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.adapters.models import Camera, Zone
from app.api.schemas import ZoneCreate, ZoneResponse, ZoneUpdate
from app.core.deps import CurrentUser, get_current_user
from app.core.errors import NotFoundError, ValidationAppError
from app.core.ids import new_id, slugify

router = APIRouter(tags=["zones"])


def _to_response(zone: Zone) -> ZoneResponse:
    return ZoneResponse(
        id=zone.id,
        camera_id=zone.camera_id,
        name=zone.name,
        kind=zone.kind,
        points=list(zone.points_json),
        enabled=zone.enabled,
        created_at=zone.created_at,
    )


@router.get("/api/v1/cameras/{camera_id}/zones", response_model=list[ZoneResponse])
async def list_zones(
    camera_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ZoneResponse]:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")
    result = await db.execute(select(Zone).where(Zone.camera_id == camera_id))
    return [_to_response(z) for z in result.scalars().all()]


@router.post(
    "/api/v1/cameras/{camera_id}/zones",
    response_model=ZoneResponse,
    status_code=201,
)
async def create_zone(
    camera_id: str,
    body: ZoneCreate,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ZoneResponse:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")
    if body.kind != "polygon":
        raise ValidationAppError("בשלב זה נתמך רק אזור מסוג polygon")

    zone_id = body.id or f"zone_{slugify(body.name)}"
    if await db.get(Zone, zone_id) is not None:
        zone_id = new_id("zone")

    zone = Zone(
        id=zone_id,
        camera_id=camera_id,
        name=body.name,
        kind="polygon",
        points_json=body.points,
        enabled=body.enabled,
        created_at=datetime.now(UTC),
    )
    db.add(zone)
    await db.commit()
    await db.refresh(zone)
    return _to_response(zone)


@router.get("/api/v1/zones/{zone_id}", response_model=ZoneResponse)
async def get_zone(
    zone_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ZoneResponse:
    zone = await db.get(Zone, zone_id)
    if zone is None:
        raise NotFoundError("אזור לא נמצא")
    return _to_response(zone)


@router.patch("/api/v1/zones/{zone_id}", response_model=ZoneResponse)
async def update_zone(
    zone_id: str,
    body: ZoneUpdate,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ZoneResponse:
    zone = await db.get(Zone, zone_id)
    if zone is None:
        raise NotFoundError("אזור לא נמצא")
    if body.name is not None:
        zone.name = body.name
    if body.points is not None:
        zone.points_json = body.points
    if body.enabled is not None:
        zone.enabled = body.enabled
    await db.commit()
    await db.refresh(zone)
    return _to_response(zone)


@router.delete("/api/v1/zones/{zone_id}", status_code=204)
async def delete_zone(
    zone_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    zone = await db.get(Zone, zone_id)
    if zone is None:
        raise NotFoundError("אזור לא נמצא")
    await db.delete(zone)
    await db.commit()
