"""Regression: toggling one Rule must not change sibling Rules."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

ZONE = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]


async def _seed_three_rules(client: AsyncClient, headers: dict) -> list[str]:
    cam = await client.post(
        "/api/v1/cameras",
        headers=headers,
        json={"id": "cam_toggle", "name": "שער", "enabled": True},
    )
    assert cam.status_code == 201, cam.text

    zone = await client.post(
        "/api/v1/cameras/cam_toggle/zones",
        headers=headers,
        json={"id": "z_toggle", "name": "אזור", "points": ZONE, "enabled": True},
    )
    assert zone.status_code == 201, zone.text

    ids: list[str] = []
    for name in ("Rule A", "Rule B", "Rule C"):
        created = await client.post(
            "/api/v1/rules",
            headers=headers,
            json={
                "name": name,
                "enabled": True,
                "conditions": {
                    "object_classes": ["person"],
                    "camera_id": "cam_toggle",
                    "zone_id": "z_toggle",
                    "trigger": "zone_enter",
                },
                "actions": [{"type": "create_event"}],
                "cooldown_seconds": 0,
            },
        )
        assert created.status_code == 201, created.text
        ids.append(created.json()["id"])
    return ids


@pytest.mark.asyncio
async def test_toggle_one_rule_leaves_siblings_unchanged(
    client: AsyncClient, auth_headers: dict
) -> None:
    a_id, b_id, c_id = await _seed_three_rules(client, auth_headers)

    patched = await client.patch(
        f"/api/v1/rules/{b_id}",
        headers=auth_headers,
        json={"enabled": False},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["id"] == b_id
    assert patched.json()["enabled"] is False

    listed = await client.get("/api/v1/rules", headers=auth_headers)
    assert listed.status_code == 200
    by_id = {r["id"]: r for r in listed.json() if r["id"] in {a_id, b_id, c_id}}
    assert by_id[a_id]["enabled"] is True
    assert by_id[b_id]["enabled"] is False
    assert by_id[c_id]["enabled"] is True

    # Second toggle — only A flips
    patched_a = await client.patch(
        f"/api/v1/rules/{a_id}",
        headers=auth_headers,
        json={"enabled": False},
    )
    assert patched_a.status_code == 200
    assert patched_a.json()["enabled"] is False

    listed2 = await client.get("/api/v1/rules", headers=auth_headers)
    by_id2 = {r["id"]: r for r in listed2.json() if r["id"] in {a_id, b_id, c_id}}
    assert by_id2[a_id]["enabled"] is False
    assert by_id2[b_id]["enabled"] is False
    assert by_id2[c_id]["enabled"] is True

    # Direct GETs match list (DB truth)
    for rid, expected in ((a_id, False), (b_id, False), (c_id, True)):
        got = await client.get(f"/api/v1/rules/{rid}", headers=auth_headers)
        assert got.status_code == 200
        assert got.json()["enabled"] is expected
