"""Metric Definition API + capability validation."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.domain.metrics.definitions import (
    build_object_classes,
    suggest_metric_name,
    validate_definition_payload,
)
from app.domain.vision_capabilities import OBJECT_TYPES, VEHICLE_CLASSES, resolve_object_classes

WAREHOUSE = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]
LINE = [[0.1, 0.5], [0.9, 0.5]]


async def _cam_with_spatial(client: AsyncClient, headers: dict) -> None:
    r = await client.post(
        "/api/v1/cameras",
        headers=headers,
        json={"id": "cam_mdef", "name": "כניסה", "enabled": True},
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        "/api/v1/cameras/cam_mdef/zones",
        headers=headers,
        json={"id": "lobby", "name": "לובי", "points": WAREHOUSE, "enabled": True},
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        "/api/v1/cameras/cam_mdef/lines",
        headers=headers,
        json={
            "id": "gate",
            "name": "שער ראשי",
            "points": LINE,
            "direction": "any",
            "label_a_to_b": "חוץ → פנים",
            "label_b_to_a": "פנים → חוץ",
            "enabled": True,
        },
    )
    assert r.status_code == 201, r.text


def test_capabilities_vehicle_group() -> None:
    assert set(OBJECT_TYPES) >= {"person", "vehicle", "car", "truck"}
    assert resolve_object_classes("vehicle") == sorted(VEHICLE_CLASSES)
    assert "bicycle" not in VEHICLE_CLASSES
    assert build_object_classes("person") == ["person"]


def test_validate_entries_requires_line_and_direction() -> None:
    errs = validate_definition_payload(
        metric_type="entries",
        object_type="person",
        scope_type="line",
        zone_id=None,
        line_id=None,
        direction=None,
    )
    assert any("קו" in e for e in errs)
    assert any("כיוון" in e for e in errs)

    ok = validate_definition_payload(
        metric_type="entries",
        object_type="person",
        scope_type="line",
        zone_id=None,
        line_id="gate",
        direction="a_to_b",
    )
    assert ok == []


def test_validate_occupancy_requires_zone() -> None:
    errs = validate_definition_payload(
        metric_type="occupancy_current",
        object_type="person",
        scope_type="zone",
        zone_id=None,
        line_id=None,
        direction=None,
    )
    assert any("אזור" in e for e in errs)


def test_unsupported_object_rejected() -> None:
    errs = validate_definition_payload(
        metric_type="entries",
        object_type="dog",  # type: ignore[arg-type]
        scope_type="line",
        zone_id=None,
        line_id="gate",
        direction="a_to_b",
    )
    assert errs


def test_suggest_names() -> None:
    assert "כניסות" in suggest_metric_name(metric_type="entries", object_type="person")
    assert "לובי" in suggest_metric_name(
        metric_type="occupancy_current", object_type="person", place_name="לובי"
    )


@pytest.mark.asyncio
async def test_metric_definition_crud(client: AsyncClient, auth_headers: dict) -> None:
    await _cam_with_spatial(client, auth_headers)

    # reject unsupported object via API (pydantic)
    bad = await client.post(
        "/api/v1/cameras/cam_mdef/metrics",
        headers=auth_headers,
        json={
            "metric_type": "entries",
            "object_type": "white_dog",
            "scope_type": "line",
            "line_id": "gate",
            "direction": "a_to_b",
        },
    )
    assert bad.status_code == 422

    # entries without line
    missing = await client.post(
        "/api/v1/cameras/cam_mdef/metrics",
        headers=auth_headers,
        json={"metric_type": "entries", "object_type": "vehicle", "scope_type": "line"},
    )
    assert missing.status_code == 422 or missing.status_code == 400

    created = await client.post(
        "/api/v1/cameras/cam_mdef/metrics",
        headers=auth_headers,
        json={
            "metric_type": "entries",
            "object_type": "vehicle",
            "scope_type": "line",
            "line_id": "gate",
            "direction": "a_to_b",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["object_type"] == "vehicle"
    assert set(body["object_classes"]) == set(VEHICLE_CLASSES)
    assert body["line_id"] == "gate"
    assert body["enabled"] is True
    assert "כניסות" in body["name"] or "רכבים" in body["name"]
    mid = body["id"]

    listed = await client.get("/api/v1/cameras/cam_mdef/metrics", headers=auth_headers)
    assert listed.status_code == 200
    assert any(m["id"] == mid for m in listed.json())

    # occupancy
    occ = await client.post(
        "/api/v1/cameras/cam_mdef/metrics",
        headers=auth_headers,
        json={
            "metric_type": "occupancy_current",
            "object_type": "person",
            "scope_type": "zone",
            "zone_id": "lobby",
        },
    )
    assert occ.status_code == 201, occ.text

    # objects observed — full FOV
    obs = await client.post(
        "/api/v1/cameras/cam_mdef/metrics",
        headers=auth_headers,
        json={
            "metric_type": "objects_observed",
            "object_type": "person",
            "scope_type": "camera",
        },
    )
    assert obs.status_code == 201, obs.text

    patched = await client.patch(
        f"/api/v1/metric-definitions/{mid}",
        headers=auth_headers,
        json={"enabled": False, "name": "כניסות רכבים — שער"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["enabled"] is False
    assert patched.json()["name"] == "כניסות רכבים — שער"

    deleted = await client.delete(f"/api/v1/metric-definitions/{mid}", headers=auth_headers)
    assert deleted.status_code == 204

    gone = await client.get(f"/api/v1/metric-definitions/{mid}", headers=auth_headers)
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_all_metric_types_create(client: AsyncClient, auth_headers: dict) -> None:
    await _cam_with_spatial(client, auth_headers)
    specs = [
        {"metric_type": "entries", "object_type": "person", "scope_type": "line", "line_id": "gate", "direction": "a_to_b"},
        {"metric_type": "exits", "object_type": "car", "scope_type": "line", "line_id": "gate", "direction": "b_to_a"},
        {"metric_type": "line_crossings", "object_type": "truck", "scope_type": "line", "line_id": "gate", "direction": "any"},
        {"metric_type": "occupancy_current", "object_type": "person", "scope_type": "zone", "zone_id": "lobby"},
        {"metric_type": "occupancy_peak", "object_type": "person", "scope_type": "zone", "zone_id": "lobby"},
        {"metric_type": "dwell_avg", "object_type": "person", "scope_type": "zone", "zone_id": "lobby"},
        {"metric_type": "dwell_max", "object_type": "person", "scope_type": "zone", "zone_id": "lobby"},
        {"metric_type": "objects_observed", "object_type": "bicycle", "scope_type": "camera"},
    ]
    for spec in specs:
        r = await client.post("/api/v1/cameras/cam_mdef/metrics", headers=auth_headers, json=spec)
        assert r.status_code == 201, (spec, r.text)
