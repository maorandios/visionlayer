"""Edge API health endpoint smoke tests."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "edge-api"


@pytest.mark.asyncio
async def test_ready_includes_db_and_camera_counts(client: AsyncClient) -> None:
    response = await client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in ("ok", "degraded")
    assert "database" in body["checks"]
    assert "cameras" in body
    assert "total" in body["cameras"]
    assert "online" in body["cameras"]
    # Never fabricate hardware telemetry
    assert "gpu" not in body
    assert "temperature" not in body


@pytest.mark.asyncio
async def test_root_exposes_feature_flags(client: AsyncClient) -> None:
    response = await client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert "features" in body
    assert body["features"]["simulate_detections"] is True
    assert body["features"]["cloud_sync"] is False
    assert body["features"]["video_lab"] is True
    assert body["phase"] == "video-lab"
