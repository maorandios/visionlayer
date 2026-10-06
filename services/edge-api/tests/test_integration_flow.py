"""Integration test: fake detection → zone → rule → event."""

from __future__ import annotations

import time
from datetime import UTC

import pytest
from httpx import AsyncClient

WAREHOUSE = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]


async def _setup_core(client: AsyncClient, headers: dict, *, schedule=None, min_duration=30):
    cam = await client.post(
        "/api/v1/cameras",
        headers=headers,
        json={"id": "cam_01", "name": "מחסן", "enabled": True},
    )
    assert cam.status_code == 201, cam.text

    zone = await client.post(
        "/api/v1/cameras/cam_01/zones",
        headers=headers,
        json={"id": "warehouse", "name": "אזור מחסן", "points": WAREHOUSE, "enabled": True},
    )
    assert zone.status_code == 201, zone.text

    conditions = {
        "object_classes": ["person"],
        "camera_id": "cam_01",
        "zone_id": "warehouse",
        "min_duration_seconds": min_duration,
    }
    if schedule is not None:
        conditions["schedule"] = schedule

    rule = await client.post(
        "/api/v1/rules",
        headers=headers,
        json={
            "id": "rule_night",
            "name": "אדם במחסן בלילה",
            "enabled": True,
            "conditions": conditions,
            "actions": [{"type": "push_notification"}],
            "cooldown_seconds": 60,
        },
    )
    assert rule.status_code == 201, rule.text


@pytest.mark.asyncio
async def test_person_loiter_creates_event(client: AsyncClient, auth_headers: dict) -> None:
    await _setup_core(
        client,
        auth_headers,
        schedule={"from": "00:00", "to": "23:59"},
        min_duration=5,
    )

    base_ts = time.time()
    # Use scenario that stays in zone for duration
    resp = await client.post(
        "/api/v1/simulate/scenario",
        headers=auth_headers,
        json={
            "scenario": "person_loiter_zone",
            "camera_id": "cam_01",
            "zone_id": "warehouse",
            "track_id": 7,
            "base_timestamp": base_ts,
            "duration_seconds": 6,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["detections_published"] >= 6
    assert len(body["event_ids"]) >= 1

    events = await client.get("/api/v1/events", headers=auth_headers)
    assert events.status_code == 200
    items = events.json()
    assert len(items) >= 1
    assert items[0]["object_class"] == "person"
    assert items[0]["zone_id"] == "warehouse"
    assert items[0]["state"] == "new"
    assert items[0]["message_he"]


@pytest.mark.asyncio
async def test_dog_does_not_create_event(client: AsyncClient, auth_headers: dict) -> None:
    await _setup_core(
        client,
        auth_headers,
        schedule={"from": "00:00", "to": "23:59"},
        min_duration=0,
    )
    # First clear by using dog class via raw detection inside zone
    # Center of warehouse ~ (0.5, 0.5) -> bbox bottom center there
    bbox = [860, 500, 1060, 540]
    resp = await client.post(
        "/api/v1/simulate/detection",
        headers=auth_headers,
        json={
            "camera_id": "cam_01",
            "class": "dog",
            "bbox": bbox,
            "track_id": 9,
            "timestamp": time.time(),
            "frame_size": [1920, 1080],
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["event_ids"] == []

    events = await client.get("/api/v1/events", headers=auth_headers)
    assert events.json() == []


@pytest.mark.asyncio
async def test_outside_schedule_no_event(client: AsyncClient, auth_headers: dict) -> None:
    await _setup_core(
        client,
        auth_headers,
        schedule={"from": "22:00", "to": "06:00"},
        min_duration=0,
    )
    # Afternoon timestamp — outside night schedule
    afternoon = datetime_to_ts(15, 0)
    resp = await client.post(
        "/api/v1/simulate/scenario",
        headers=auth_headers,
        json={
            "scenario": "person_enter_zone",
            "camera_id": "cam_01",
            "zone_id": "warehouse",
            "track_id": 3,
            "base_timestamp": afternoon,
            "duration_seconds": 0,
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["event_ids"] == []


def datetime_to_ts(hour: int, minute: int) -> float:
    from datetime import datetime

    return datetime(2026, 10, 5, hour, minute, tzinfo=UTC).timestamp()


@pytest.mark.asyncio
async def test_cooldown_suppresses_second_event(client: AsyncClient, auth_headers: dict) -> None:
    await _setup_core(
        client,
        auth_headers,
        schedule={"from": "00:00", "to": "23:59"},
        min_duration=0,
    )
    base = time.time()
    first = await client.post(
        "/api/v1/simulate/scenario",
        headers=auth_headers,
        json={
            "scenario": "person_enter_zone",
            "camera_id": "cam_01",
            "zone_id": "warehouse",
            "track_id": 1,
            "base_timestamp": base,
        },
    )
    assert len(first.json()["event_ids"]) == 1

    second = await client.post(
        "/api/v1/simulate/scenario",
        headers=auth_headers,
        json={
            "scenario": "person_enter_zone",
            "camera_id": "cam_01",
            "zone_id": "warehouse",
            "track_id": 2,
            "base_timestamp": base + 10,
        },
    )
    assert second.json()["event_ids"] == []


@pytest.mark.asyncio
async def test_disabled_camera_no_event(client: AsyncClient, auth_headers: dict) -> None:
    await _setup_core(
        client,
        auth_headers,
        schedule={"from": "00:00", "to": "23:59"},
        min_duration=0,
    )
    await client.post("/api/v1/cameras/cam_01/disable", headers=auth_headers)
    resp = await client.post(
        "/api/v1/simulate/scenario",
        headers=auth_headers,
        json={
            "scenario": "person_enter_zone",
            "camera_id": "cam_01",
            "zone_id": "warehouse",
            "track_id": 5,
            "base_timestamp": time.time(),
        },
    )
    assert resp.json()["event_ids"] == []


@pytest.mark.asyncio
async def test_ack_event(client: AsyncClient, auth_headers: dict) -> None:
    await _setup_core(
        client,
        auth_headers,
        schedule={"from": "00:00", "to": "23:59"},
        min_duration=0,
    )
    created = await client.post(
        "/api/v1/simulate/scenario",
        headers=auth_headers,
        json={
            "scenario": "person_enter_zone",
            "camera_id": "cam_01",
            "zone_id": "warehouse",
            "track_id": 11,
            "base_timestamp": time.time(),
        },
    )
    event_id = created.json()["event_ids"][0]
    ack = await client.patch(f"/api/v1/events/{event_id}/acknowledge", headers=auth_headers)
    assert ack.status_code == 200
    assert ack.json()["state"] == "acknowledged"
