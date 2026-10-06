"""FastAPI dependencies."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.adapters.models import User
from app.core.errors import AppError
from app.core.security import decode_access_token


@dataclass(slots=True)
class CurrentUser:
    id: str
    username: str
    role: str


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("נדרשת התחברות", code="unauthorized", status_code=401)
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    username = str(payload.get("sub") or "")
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise AppError("משתמש לא נמצא", code="unauthorized", status_code=401)
    return CurrentUser(id=user.id, username=user.username, role=user.role)


async def get_optional_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser | None:
    if not authorization:
        return None
    return await get_current_user(authorization=authorization, db=db)
