"""Shared pytest fixtures for Phase 1."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.adapters.db import reset_db_engine
from app.core.config import get_settings


@pytest.fixture
async def client(tmp_path, monkeypatch):
    db_file = tmp_path / "phase1.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_file.as_posix()}")
    monkeypatch.setenv("VL_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("VL_ADMIN_PASSWORD", "admin123")
    monkeypatch.setenv("VL_JWT_SECRET", "test-secret-key-with-32bytes-min!!")
    monkeypatch.setenv("FEATURE_SIMULATE_DETECTIONS", "true")
    monkeypatch.setenv("FEATURE_VIDEO_LAB", "true")
    monkeypatch.setenv("VL_ENV", "test")
    monkeypatch.setenv("VL_SEED_DEMO", "false")
    monkeypatch.setenv("VL_EVENT_MEDIA_DIR", str(tmp_path / "event-media"))
    get_settings.cache_clear()
    reset_db_engine()

    from app.main import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with app.router.lifespan_context(app), AsyncClient(
        transport=transport, base_url="http://test"
    ) as ac:
        yield ac

    # Dispose engine so aiosqlite worker threads shut down cleanly
    from app.adapters.db import get_engine

    eng = get_engine()
    await eng.dispose()
    get_settings.cache_clear()
    reset_db_engine()


@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
