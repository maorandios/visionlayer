"""Video Lab integration: fixture video → detect → track → zone → rule → event."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest
from httpx import AsyncClient


def _write_fixture_mp4(path: Path, *, frames: int = 40, fps: float = 10.0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 320, 240
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(path), fourcc, fps, (w, h))
    assert writer.isOpened()
    for i in range(frames):
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:] = (30, 30, 30)
        x1 = 40 + i * 3
        y1 = 50
        x2 = x1 + 50
        y2 = y1 + 110
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), -1)
        writer.write(img)
    writer.release()


@pytest.mark.asyncio
async def test_video_lab_fixture_creates_event(
    client: AsyncClient, auth_headers: dict, tmp_path: Path
) -> None:
    fixture = tmp_path / "person_walk.mp4"
    _write_fixture_mp4(fixture)

    with fixture.open("rb") as fh:
        upload = await client.post(
            "/api/v1/video-lab/assets",
            headers=auth_headers,
            files={"file": ("person_walk.mp4", fh, "video/mp4")},
            data={"name_he": "בדיקת רחוב", "location": "מעבדה"},
        )
    assert upload.status_code == 200, upload.text
    asset = upload.json()
    camera_id = asset["camera_id"]

    # Zone covering most of the frame (normalized)
    zone = await client.post(
        f"/api/v1/cameras/{camera_id}/zones",
        headers=auth_headers,
        json={
            "name": "אזור בדיקה",
            "points": [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]],
            "enabled": True,
        },
    )
    assert zone.status_code == 201, zone.text
    zone_id = zone.json()["id"]

    rule = await client.post(
        "/api/v1/rules",
        headers=auth_headers,
        json={
            "name": "אדם באזור בדיקה",
            "enabled": True,
            "conditions": {
                "object_classes": ["person"],
                "camera_id": camera_id,
                "zone_id": zone_id,
                "schedule": {"from": "00:00", "to": "23:59"},
                "min_duration_seconds": 1,
            },
            "actions": [{"type": "push_notification"}],
            "cooldown_seconds": 0,
        },
    )
    assert rule.status_code == 201, rule.text

    analyze = await client.post(
        f"/api/v1/video-lab/assets/{asset['id']}/analyze",
        headers=auth_headers,
    )
    assert analyze.status_code == 200, analyze.text
    job = analyze.json()
    assert job["status"] == "completed"
    assert job["metrics"]["frames_processed"] > 0
    assert job["metrics"]["detections_count"] > 0
    assert job["metrics"]["unique_tracks"] >= 1
    assert len(job["event_ids"]) >= 1
    assert "rule_checks" in job["summary"]
    assert job["summary"]["rule_checks"]
    assert job["summary"]["rule_checks"][0]["triggered"] is True
    assert job["summary"]["hits"]
    assert job["summary"]["first_seen_by_class"]
    assert job["summary"]["best_frames"]
    assert job["summary"]["best_frames"][0]["confidence_pct"] >= 0
    assert job["summary"]["track_gallery"]
    assert len(job["summary"]["track_gallery"]) == job["metrics"]["unique_tracks"]
    assert job["summary"]["track_gallery"][0]["has_image"] is True
    assert "image_url" in job["summary"]["track_gallery"][0]
    assert job["benchmark_run_id"]
    assert job["benchmark"]["metrics"]["detections_total"] == job["metrics"]["detections_count"]
    assert job["benchmark"]["metrics"]["unique_tracks_total"] == job["metrics"]["unique_tracks"]
    assert job["benchmark"]["metrics"]["events_total"] == len(job["event_ids"])
    assert job["benchmark"]["metrics"]["analysis_time_seconds"] > 0
    assert job["benchmark"]["metrics"]["processing_fps"] > 0
    assert job["benchmark"]["metrics"]["false_positives"]["false_positive_rate"] is None
    assert job["summary"]["search_classes"] == ["person"]
    assert job["metrics"]["tracker_name"] == "bytetrack"
    assert "frame_stride" in job["metrics"]
    assert "runtime_config" in job["metrics"]
    assert "tracking_diagnostics" in job["metrics"]
    assert any(item.get("kind") == "event" for item in job["timeline"])
    assert "progress" in job

    tid = job["summary"]["track_gallery"][0]["track_id"]
    img = await client.get(
        f"/api/v1/video-lab/jobs/{job['id']}/tracks/{tid}/image",
        headers=auth_headers,
    )
    assert img.status_code == 200
    assert img.headers["content-type"].startswith("image/")

    events = await client.get("/api/v1/events", headers=auth_headers)
    assert events.status_code == 200
    items = events.json()
    assert any(e["id"] in job["event_ids"] for e in items)
    matched = next(e for e in items if e["id"] == job["event_ids"][0])
    assert matched["payload"].get("source") == "development_video"
    assert matched["payload"].get("video_lab_asset_id") == asset["id"]
    assert matched["payload"].get("video_lab_job_id") == job["id"]
    assert matched["payload"].get("video_lab_run_id") == job["benchmark_run_id"]
    assert matched["message_he"]
    assert matched.get("has_snapshot") is True
    assert matched.get("trigger_timestamp_sec") is not None

    snap = await client.get(f"/api/v1/events/{matched['id']}/snapshot", headers=auth_headers)
    assert snap.status_code == 200
    assert snap.headers["content-type"].startswith("image/")

    run_id = job["benchmark_run_id"]
    tid = job["summary"]["track_gallery"][0]["track_id"]
    review = await client.patch(
        f"/api/v1/video-lab/runs/{run_id}/tracks/{tid}/review",
        headers=auth_headers,
        json={"review_status": "false_positive"},
    )
    assert review.status_code == 200, review.text
    body = review.json()
    assert body["metrics"]["false_positives"]["false_positive_tracks"] == 1
    assert body["metrics"]["false_positives"]["reviewed_tracks"] == 1
    assert body["metrics"]["false_positives"]["false_positive_rate"] == 1.0

    history = await client.get(
        f"/api/v1/video-lab/assets/{asset['id']}/runs",
        headers=auth_headers,
    )
    assert history.status_code == 200
    assert any(r["id"] == run_id for r in history.json())

    # Metrics: Video Lab writes are isolated under scope=video_lab + run id …
    lab_metrics = await client.get(
        "/api/v1/metrics/summary",
        headers=auth_headers,
        params={"scope": "video_lab", "analysis_run_id": run_id, "camera_id": camera_id},
    )
    assert lab_metrics.status_code == 200, lab_metrics.text
    lab = lab_metrics.json()
    assert lab["totals"]["unique_objects"] >= 1
    assert lab["totals"]["zone_entries"] >= 1
    assert lab["totals"]["events_total"] == len(job["event_ids"])
    # … and production totals stay untouched by analysis runs.
    prod_metrics = await client.get(
        "/api/v1/metrics/summary", headers=auth_headers, params={"camera_id": camera_id}
    )
    assert prod_metrics.status_code == 200
    prod = prod_metrics.json()
    assert prod["totals"]["unique_objects"] == 0
    assert prod["totals"]["zone_entries"] == 0
    assert prod["totals"]["events_total"] == 0
