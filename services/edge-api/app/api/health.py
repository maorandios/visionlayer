"""Health and readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from app.adapters.db import check_db, get_session_factory
from app.adapters.models import Camera
from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "service": "edge-api",
        "version": settings.app_version,
    }


@router.get("/ready")
async def ready() -> dict:
    """Readiness — real checks only (DB + camera counts). No fabricated Jetson metrics."""
    settings = get_settings()
    db_ok = await check_db()
    cameras_total = 0
    cameras_online = 0
    if db_ok:
        factory = get_session_factory()
        async with factory() as session:
            total_row = await session.execute(select(func.count()).select_from(Camera))
            cameras_total = int(total_row.scalar_one() or 0)
            online_row = await session.execute(
                select(func.count()).select_from(Camera).where(Camera.status == "online", Camera.enabled.is_(True))
            )
            cameras_online = int(online_row.scalar_one() or 0)
    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "checks": {
            "database": db_ok,
            "api": True,
        },
        "cameras": {
            "total": cameras_total,
            "online": cameras_online,
        },
        "version": settings.app_version,
    }
