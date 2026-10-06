"""Metrics API through the real detection pipeline (simulate → spatial → metrics)."""

from __future__ import annotations

import time

import pytest
from httpx import AsyncClient

WAREHOUSE = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]


async def _setup(client: AsyncClient, headers: dict) -> None:
    r = await client.post(
        "/api/v1/cameras", headers=headers, json={"id": "cam_01", "name": "חניה", "enabled": True}
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        "/api/v1/cameras/cam_01/zones",
        headers=headers,
        json={"id": "lot", "name": "מגרש חניה", "points": WAREHOUSE, "enabled": True},
    )
    assert r.status_code == 201, r.text


def _det(cls: str, track_id: int, ts: float, *, inside: bool) -> dict:
    bbox = [900, 500, 1000, 560] if inside else [10, 10, 60, 60]
    return {
        "camera_id": "cam_01",
        "class": cls,
        "bbox": bbox,
        "track_id": track_id,
        "timestamp": ts,
        "frame_size": [1920, 1080],
    }


@pytest.mark.asyncio
async def test_metrics_persist_from_pipeline_without_rules(client: AsyncClient, auth_headers: dict) -> None:
    """Metrics are independent of rules — entries are counted even when no rule exists."""
    await _setup(client, auth_headers)
    base = time.time()
    # 3 unique cars enter; car 1 seen in 5 frames (must count once)
    for i in range(5):
        r = await client.post("/api/v1/simulate/detection", headers=auth_headers, json=_det("car", 1, base + i * 0.2, inside=True))
        assert r.status_code == 200, r.text
    for tid in (2, 3):
        r = await client.post("/api/v1/simulate/detection", headers=auth_headers, json=_det("car", tid, base + 1.0, inside=True))
        assert r.status_code == 200
    # all three keep being seen every few seconds (< stale gap of 5s) …
    for ts in (4.0, 7.5):
        for tid in (1, 2, 3):
            r = await client.post("/api/v1/simulate/detection", headers=auth_headers, json=_det("car", tid, base + ts, inside=True))
            assert r.status_code == 200
    # … then car 1 leaves after 8 seconds inside
    r = await client.post("/api/v1/simulate/detection", headers=auth_headers, json=_det("car", 1, base + 8.0, inside=False))
    assert r.status_code == 200

    s = await client.get("/api/v1/metrics/summary", headers=auth_headers)
    assert s.status_code == 200, s.text
    body = s.json()
    assert body["scope"] == "production"
    assert body["totals"]["zone_entries"] == 3
    assert body["totals"]["unique_objects"] == 3
    assert body["totals"]["zone_exits"] == 1
    assert body["vehicles"]["zone_entries"] == 3
    assert body["dwell"]["sessions"] == 1
    assert body["dwell"]["avg_seconds"] == pytest.approx(8.0, abs=0.01)
    occ = next(o for o in body["occupancy"] if o["zone_id"] == "lot")
    assert occ["current"] == 2
    assert occ["peak"] == 3

    ts = await client.get(
        "/api/v1/metrics/timeseries",
        headers=auth_headers,
        params={"metric_type": "zone_entries", "bucket": "hour", "camera_id": "cam_01"},
    )
    assert ts.status_code == 200, ts.text
    assert sum(p["value"] for p in ts.json()["points"]) == 3

    bd = await client.get(
        "/api/v1/metrics/breakdown",
        headers=auth_headers,
        params={"metric_type": "zone_entries", "by": "zone"},
    )
    assert bd.status_code == 200, bd.text
    assert bd.json()["items"] == [{"key": "lot", "value": 3.0, "count": 3}]

    # Filters: group + camera, and a window that excludes everything
    veh = await client.get(
        "/api/v1/metrics/summary", headers=auth_headers, params={"object_class": "vehicle", "camera_id": "cam_01"}
    )
    assert veh.json()["totals"]["zone_entries"] == 3
    none = await client.get(
        "/api/v1/metrics/summary", headers=auth_headers, params={"from": "2000-01-01T00:00:00Z", "to": "2000-01-02T00:00:00Z"}
    )
    assert none.json()["totals"]["zone_entries"] == 0


@pytest.mark.asyncio
async def test_metrics_api_validates_params(client: AsyncClient, auth_headers: dict) -> None:
    bad_scope = await client.get("/api/v1/metrics/summary", headers=auth_headers, params={"scope": "nope"})
    assert bad_scope.status_code == 422
    bad_metric = await client.get(
        "/api/v1/metrics/timeseries", headers=auth_headers, params={"metric_type": "nope"}
    )
    assert bad_metric.status_code == 422
    bad_by = await client.get("/api/v1/metrics/breakdown", headers=auth_headers, params={"by": "nope"})
    assert bad_by.status_code == 422
    unauth = await client.get("/api/v1/metrics/summary")
    assert unauth.status_code == 401
