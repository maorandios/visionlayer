"""Camera AI Test API — orchestrates Video Lab analysis from the camera surface."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_ai_test_status_unknown_camera(client: AsyncClient, auth_headers: dict) -> None:
    res = await client.get("/api/v1/cameras/no_such_cam/ai-test", headers=auth_headers)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_ai_test_requires_video_source(client: AsyncClient, auth_headers: dict) -> None:
    create = await client.post(
        "/api/v1/cameras",
        headers=auth_headers,
        json={"name": "ללא מקור", "location": None},
    )
    assert create.status_code == 201
    cam_id = create.json()["id"]

    status = await client.get(f"/api/v1/cameras/{cam_id}/ai-test", headers=auth_headers)
    assert status.status_code == 200
    body = status.json()
    assert body["supports_manual_analysis"] is False
    assert body["latest_successful_run"] is None

    start = await client.post(f"/api/v1/cameras/{cam_id}/ai-test", headers=auth_headers)
    assert start.status_code in (400, 422)
