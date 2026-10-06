"""Line CRUD endpoints for crossing rules."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.adapters.models import Camera, Line
from app.api.schemas import LineCreate, LineResponse, LineUpdate
from app.core.deps import CurrentUser, get_current_user
from app.core.errors import NotFoundError, ValidationAppError
from app.core.ids import new_id, slugify

router = APIRouter(tags=["lines"])


def _to_response(line: Line) -> LineResponse:
    return LineResponse(
        id=line.id,
        camera_id=line.camera_id,
        name=line.name,
        points=list(line.points_json),
        direction=line.direction or "any",
        enabled=line.enabled,
        created_at=line.created_at,
    )


@router.get("/api/v1/cameras/{camera_id}/lines", response_model=list[LineResponse])
async def list_lines(
    camera_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[LineResponse]:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")
    result = await db.execute(select(Line).where(Line.camera_id == camera_id))
    return [_to_response(ln) for ln in result.scalars().all()]


@router.post(
    "/api/v1/cameras/{camera_id}/lines",
    response_model=LineResponse,
    status_code=201,
)
async def create_line(
    camera_id: str,
    body: LineCreate,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LineResponse:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")
    if len(body.points) != 2:
        raise ValidationAppError("קו דורש בדיוק שתי נקודות")

    line_id = body.id or f"line_{slugify(body.name)}"
    if await db.get(Line, line_id) is not None:
        line_id = new_id("line")

    line = Line(
        id=line_id,
        camera_id=camera_id,
        name=body.name,
        points_json=body.points,
        direction=body.direction,
        enabled=body.enabled,
        created_at=datetime.now(UTC),
    )
    db.add(line)
    await db.commit()
    await db.refresh(line)
    return _to_response(line)


@router.get("/api/v1/lines/{line_id}", response_model=LineResponse)
async def get_line(
    line_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LineResponse:
    line = await db.get(Line, line_id)
    if line is None:
        raise NotFoundError("קו לא נמצא")
    return _to_response(line)


@router.patch("/api/v1/lines/{line_id}", response_model=LineResponse)
async def update_line(
    line_id: str,
    body: LineUpdate,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LineResponse:
    line = await db.get(Line, line_id)
    if line is None:
        raise NotFoundError("קו לא נמצא")
    if body.name is not None:
        line.name = body.name
    if body.points is not None:
        if len(body.points) != 2:
            raise ValidationAppError("קו דורש בדיוק שתי נקודות")
        line.points_json = body.points
    if body.direction is not None:
        line.direction = body.direction
    if body.enabled is not None:
        line.enabled = body.enabled
    await db.commit()
    await db.refresh(line)
    return _to_response(line)


@router.delete("/api/v1/lines/{line_id}", status_code=204)
async def delete_line(
    line_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    line = await db.get(Line, line_id)
    if line is None:
        raise NotFoundError("קו לא נמצא")
    await db.delete(line)
    await db.commit()
