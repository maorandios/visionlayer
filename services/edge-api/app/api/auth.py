"""Auth endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.adapters.models import User
from app.api.schemas import LoginRequest, TokenResponse, UserResponse
from app.core.deps import CurrentUser, get_current_user
from app.core.errors import AppError
from app.core.security import create_access_token, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise AppError("שם משתמש או סיסמה שגויים", code="invalid_credentials", status_code=401)
    token = create_access_token(subject=user.username, role=user.role)
    return TokenResponse(access_token=token)


@router.post("/logout")
async def logout(_user: CurrentUser = Depends(get_current_user)) -> dict:
    # Stateless JWT — client discards token. Endpoint exists for API symmetry.
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser = Depends(get_current_user)) -> UserResponse:
    return UserResponse(id=user.id, username=user.username, role=user.role)
