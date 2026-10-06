"""Event list / get / acknowledge endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.adapters.models import Event
from app.api.event_serializers import event_to_payload
from app.api.schemas import EventAckResponse, EventResponse
from app.core.deps import CurrentUser, get_current_user
from app.core.errors import AppError, NotFoundError
from app.domain.media.paths import clip_file, resolve_stored_media, snapshot_file

router = APIRouter(prefix="/api/v1/events", tags=["events"])


def _to_response(event: Event) -> EventResponse:
    data = event_to_payload(event)
    return EventResponse(**data)


@router.get("", response_model=list[EventResponse])
async def list_events(
    camera_id: str | None = Query(default=None),
    state: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EventResponse]:
    stmt = select(Event).order_by(Event.created_at.desc()).limit(limit)
    if camera_id:
        stmt = stmt.where(Event.camera_id == camera_id)
    if state:
        stmt = stmt.where(Event.state == state)
    result = await db.execute(stmt)
    return [_to_response(e) for e in result.scalars().all()]


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    event = await db.get(Event, event_id)
    if event is None:
        raise NotFoundError("אירוע לא נמצא")
    return _to_response(event)


@router.get("/{event_id}/snapshot")
async def get_event_snapshot(
    event_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    event = await db.get(Event, event_id)
    if event is None:
        raise NotFoundError("אירוע לא נמצא")
    stored = event.snapshot_path or event.thumbnail_path
    path = resolve_stored_media(stored) if stored else snapshot_file(event_id)
    if path is None or not path.is_file():
        path = snapshot_file(event_id)
    if not path.is_file():
        raise AppError(
            "תמונת האירוע אינה זמינה",
            code="event_media_unavailable",
            status_code=404,
        )
    return FileResponse(path, media_type="image/jpeg", filename="snapshot.jpg")


@router.get("/{event_id}/clip")
async def get_event_clip(
    event_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    event = await db.get(Event, event_id)
    if event is None:
        raise NotFoundError("אירוע לא נמצא")
    stored = event.clip_path
    path = resolve_stored_media(stored) if stored else clip_file(event_id)
    if path is None or not path.is_file():
        path = clip_file(event_id)
    if not path.is_file():
        raise AppError(
            "קליפ האירוע אינו זמין",
            code="event_media_unavailable",
            status_code=404,
        )
    return FileResponse(path, media_type="video/mp4", filename="clip.mp4")


@router.patch("/{event_id}/acknowledge", response_model=EventAckResponse)
async def acknowledge_event(
    event_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventAckResponse:
    event = await db.get(Event, event_id)
    if event is None:
        raise NotFoundError("אירוע לא נמצא")
    event.state = "acknowledged"
    await db.commit()
    return EventAckResponse(id=event.id, state=event.state)
