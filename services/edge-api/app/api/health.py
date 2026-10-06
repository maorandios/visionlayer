"""Health and readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.adapters.db import check_db
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
    db_ok = await check_db()
    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "checks": {
            "database": db_ok,
        },
    }
