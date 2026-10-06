"""Lines carry optional human-readable direction labels used by the Rule Wizard."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_line_direction_labels_roundtrip(client: AsyncClient, auth_headers: dict) -> None:
    cam = await client.post(
        "/api/v1/cameras", headers=auth_headers, json={"id": "cam_labels", "name": "שער", "location": None}
    )
    assert cam.status_code == 201, cam.text

    created = await client.post(
        "/api/v1/cameras/cam_labels/lines",
        headers=auth_headers,
        json={
            "name": "שער הכניסה",
            "points": [[0.2, 0.5], [0.8, 0.5]],
            "direction": "any",
            "label_a_to_b": "כניסה",
            "label_b_to_a": "יציאה",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["label_a_to_b"] == "כניסה"
    assert body["label_b_to_a"] == "יציאה"

    # Labels are optional — omitted means null, and legacy lines keep working.
    plain = await client.post(
        "/api/v1/cameras/cam_labels/lines",
        headers=auth_headers,
        json={"name": "קו", "points": [[0.1, 0.1], [0.9, 0.9]]},
    )
    assert plain.status_code == 201
    assert plain.json()["label_a_to_b"] is None

    patched = await client.patch(
        f"/api/v1/lines/{body['id']}", headers=auth_headers, json={"label_b_to_a": "החוצה"}
    )
    assert patched.status_code == 200
    assert patched.json()["label_a_to_b"] == "כניסה"
    assert patched.json()["label_b_to_a"] == "החוצה"

    listed = await client.get("/api/v1/cameras/cam_labels/lines", headers=auth_headers)
    assert {ln["label_b_to_a"] for ln in listed.json()} == {"החוצה", None}
