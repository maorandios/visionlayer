"""Demo seed for local visual QA."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.adapters.db import get_session_factory
from app.adapters.models import Camera, Event, Rule, Zone
from app.core.config import get_settings
from app.core.seed_demo import CAM_GATE, ensure_demo_seed


@pytest.mark.asyncio
async def test_demo_seed_creates_catalog(tmp_path, monkeypatch):
    db_file = tmp_path / "seed.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_file.as_posix()}")
    monkeypatch.setenv("VL_ENV", "development")
    monkeypatch.setenv("VL_SEED_DEMO", "true")
    monkeypatch.setenv("VL_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("VL_ADMIN_PASSWORD", "admin123")
    monkeypatch.setenv("VL_JWT_SECRET", "test-secret-key-with-32bytes-min!!")
    monkeypatch.setenv("FEATURE_SIMULATE_DETECTIONS", "true")
    get_settings.cache_clear()

    from app.adapters.db import Base, get_engine, reset_db_engine

    reset_db_engine()
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = get_session_factory()
    async with factory() as session:
        await ensure_demo_seed(session)
        cams = await session.scalar(select(func.count()).select_from(Camera))
        zones = await session.scalar(select(func.count()).select_from(Zone))
        rules = await session.scalar(select(func.count()).select_from(Rule))
        events = await session.scalar(select(func.count()).select_from(Event))
        assert cams == 3
        assert zones == 4
        assert rules == 3
        assert events == 5
        assert await session.get(Camera, CAM_GATE) is not None

        # Idempotent — second call does nothing
        await ensure_demo_seed(session)
        cams2 = await session.scalar(select(func.count()).select_from(Camera))
        assert cams2 == 3

    await engine.dispose()
    get_settings.cache_clear()
    reset_db_engine()


@pytest.mark.asyncio
async def test_demo_seed_disabled_in_tests(client: AsyncClient, auth_headers: dict) -> None:
    # Default test fixture sets VL_SEED_DEMO=false
    resp = await client.get("/api/v1/cameras", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []
