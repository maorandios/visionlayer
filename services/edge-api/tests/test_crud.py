"""CRUD smoke tests for cameras / zones / rules / auth."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_auth_me(client: AsyncClient, auth_headers: dict) -> None:
    me = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


@pytest.mark.asyncio
async def test_camera_crud(client: AsyncClient, auth_headers: dict) -> None:
    created = await client.post(
        "/api/v1/cameras",
        headers=auth_headers,
        json={"id": "cam_a", "name": "כניסה", "location": "לובי"},
    )
    assert created.status_code == 201
    listed = await client.get("/api/v1/cameras", headers=auth_headers)
    assert any(c["id"] == "cam_a" for c in listed.json())
    updated = await client.patch(
        "/api/v1/cameras/cam_a",
        headers=auth_headers,
        json={"name": "כניסה ראשית"},
    )
    assert updated.json()["name"] == "כניסה ראשית"
    disabled = await client.post("/api/v1/cameras/cam_a/disable", headers=auth_headers)
    assert disabled.json()["enabled"] is False
    deleted = await client.delete("/api/v1/cameras/cam_a", headers=auth_headers)
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_zone_and_rule_crud(client: AsyncClient, auth_headers: dict) -> None:
    await client.post(
        "/api/v1/cameras",
        headers=auth_headers,
        json={"id": "cam_b", "name": "חצר"},
    )
    zone = await client.post(
        "/api/v1/cameras/cam_b/zones",
        headers=auth_headers,
        json={
            "id": "yard",
            "name": "חצר אחורית",
            "points": [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
        },
    )
    assert zone.status_code == 201
    rule = await client.post(
        "/api/v1/rules",
        headers=auth_headers,
        json={
            "name": "אדם בחצר",
            "enabled": True,
            "conditions": {
                "object_classes": ["person"],
                "camera_id": "cam_b",
                "zone_id": "yard",
                "min_duration_seconds": 0,
            },
            "actions": [{"type": "create_event"}],
            "cooldown_seconds": 0,
        },
    )
    assert rule.status_code == 201
    rules = await client.get("/api/v1/rules", headers=auth_headers)
    assert len(rules.json()) == 1
