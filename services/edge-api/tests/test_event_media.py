"""Basic Event Media — snapshots, clips, API, no detector re-run."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest
from httpx import AsyncClient

from app.adapters.models import Event
from app.domain.media.clip import extract_event_clip
from app.domain.media.frame_selection import (
    TrackObservation,
    pick_representative_observation,
    score_for_event_trigger,
)
from app.domain.media.service import generate_media_for_video_lab_events
from app.domain.video_lab.snapshots import extract_annotated_frame


def _write_moving_mp4(path: Path, *, frames: int = 40, fps: float = 10.0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 320, 240
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    assert writer.isOpened()
    for i in range(frames):
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:] = (30, 30, 30)
        x1 = 40 + i * 3
        cv2.rectangle(img, (x1, 50), (x1 + 50, 160), (0, 255, 0), -1)
        cv2.rectangle(img, (200, 40), (280, 150), (0, 180, 0), -1)
        writer.write(img)
    writer.release()


def test_pick_frame_near_trigger_not_last_frame() -> None:
    obs = [
        TrackObservation(0.5, 1.0, 10, [10, 10, 50, 50], 320, 240, "person"),
        TrackObservation(0.9, 8.2, 82, [100, 100, 160, 180], 320, 240, "person"),
        TrackObservation(0.6, 15.0, 150, [120, 120, 180, 200], 320, 240, "person"),
    ]
    best = pick_representative_observation(obs, trigger_sec=8.4)
    assert best is not None
    assert best.frame_index == 82
    assert score_for_event_trigger(best, 8.4) >= score_for_event_trigger(obs[0], 8.4)


def test_snapshot_highlights_single_track_bbox(tmp_path: Path) -> None:
    video = tmp_path / "two.mp4"
    _write_moving_mp4(video, frames=5, fps=5.0)
    out = tmp_path / "snap.jpg"
    ok = extract_annotated_frame(
        video,
        frame_index=0,
        bbox=[40, 50, 90, 160],
        label="אדם 90%",
        class_name="person",
        out_path=out,
    )
    assert ok
    img = cv2.imread(str(out))
    assert img is not None
    left = img[50, 40]
    right = img[40, 200]
    assert int(left[1]) > int(right[1]) - 20


def test_generate_media_one_event_per_track(tmp_path: Path) -> None:
    video = tmp_path / "src.mp4"
    _write_moving_mp4(video, frames=30, fps=10.0)
    base = 1_700_000_000.0
    dets = []
    for i in range(30):
        ts = base + i * 0.1
        dets.append(
            {
                "type": "detection",
                "camera_id": "cam",
                "class": "person",
                "confidence": 0.5 + (0.01 * i),
                "bbox": [40 + i * 3, 50, 90 + i * 3, 160],
                "track_id": 17,
                "timestamp": ts,
                "frame_size": [320, 240],
                "frame_index": i,
            }
        )

    event = Event(
        id="evt_testmedia01",
        camera_id="cam",
        rule_id="rule1",
        type="zone_presence",
        severity="warning",
        object_class="person",
        track_id=17,
        zone_id="z1",
        confidence=0.9,
        started_at=__import__("datetime").datetime.fromtimestamp(base + 2.5, tz=__import__("datetime").UTC),
        state="new",
        message_he="בדיקה",
        payload_json={"video_timestamp_sec": 2.5, "source": "development_video"},
    )

    with patch("app.domain.media.service.get_settings") as gs:
        settings = MagicMock()
        settings.environment = "test"
        gs.return_value = settings
        with patch("app.domain.media.service.snapshot_file") as snap_fn, patch(
            "app.domain.media.service.clip_file"
        ) as clip_fn, patch("app.domain.media.service.relative_media_path") as rel:
            snap_fn.side_effect = lambda eid: tmp_path / eid / "snapshot.jpg"
            clip_fn.side_effect = lambda eid: tmp_path / eid / "clip.mp4"
            rel.side_effect = lambda eid, name: f"{eid}/{name}"

            with patch("app.domain.media.service.extract_event_clip", return_value=True):
                generate_media_for_video_lab_events(
                    [event],
                    video_path=video,
                    detections=dets,
                    base_unix_ts=base,
                    video_duration_sec=3.0,
                    analysis_run_id="run_test",
                )

    assert event.snapshot_path
    assert event.media_status in {"complete", "snapshot_only"}
    assert event.trigger_timestamp_sec == 2.5
    assert (tmp_path / "evt_testmedia01" / "snapshot.jpg").is_file()


def test_clip_opencv_fallback_without_ffmpeg(tmp_path: Path) -> None:
    video = tmp_path / "v.mp4"
    _write_moving_mp4(video, frames=30, fps=10.0)
    out = tmp_path / "clip.mp4"
    with (
        patch("app.domain.media.clip.shutil.which", return_value=None),
        patch("app.domain.media.clip._ffmpeg_exe", return_value=None),
    ):
        ok = extract_event_clip(
            video_path=video,
            out_path=out,
            trigger_sec=1.5,
            video_duration_sec=3.0,
            pre_sec=1.3,
            post_sec=1.5,
        )
    assert ok is True
    assert out.is_file() and out.stat().st_size > 0


def test_clip_h264_via_bundled_ffmpeg(tmp_path: Path) -> None:
    video = tmp_path / "v.mp4"
    _write_moving_mp4(video, frames=30, fps=10.0)
    out = tmp_path / "clip.mp4"
    ok = extract_event_clip(
        video_path=video,
        out_path=out,
        trigger_sec=1.5,
        video_duration_sec=3.0,
        pre_sec=1.3,
        post_sec=1.5,
    )
    assert ok is True
    raw = out.read_bytes()
    # H.264 in MP4 typically has avc1 brand or moov/mdat atoms
    assert b"ftyp" in raw[:32] or b"moov" in raw
    assert out.stat().st_size > 500


def test_media_generation_does_not_invoke_detector() -> None:
    """Event media modules must not import or call the video analyzer / YOLOX."""
    root = Path(__file__).resolve().parents[1] / "app" / "domain" / "media"
    combined = "\n".join(p.read_text(encoding="utf-8") for p in root.glob("*.py"))
    lowered = combined.lower()
    assert "run_video_lab_analysis" not in combined
    assert "yolox" not in lowered
    assert "onnx" not in lowered


@pytest.mark.asyncio
async def test_event_snapshot_api(
    client: AsyncClient, auth_headers: dict, tmp_path: Path
) -> None:
    from app.adapters.db import get_session_factory
    from app.domain.media.paths import snapshot_file

    event_id = "evt_api_snap01"
    snap = snapshot_file(event_id)
    snap.parent.mkdir(parents=True, exist_ok=True)
    _write_moving_mp4(tmp_path / "dummy.mp4", frames=1, fps=1)
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    cv2.imwrite(str(snap), img)

    factory = get_session_factory()
    async with factory() as session:
        from datetime import UTC, datetime

        row = Event(
            id=event_id,
            camera_id="vcam_x",
            rule_id=None,
            type="test",
            severity="info",
            object_class="person",
            track_id=1,
            zone_id=None,
            confidence=0.5,
            started_at=datetime.now(UTC),
            state="new",
            message_he="API",
            payload_json={},
            snapshot_path=f"{event_id}/snapshot.jpg",
            media_status="snapshot_only",
        )
        session.add(row)
        await session.commit()

    res = await client.get(f"/api/v1/events/{event_id}/snapshot", headers=auth_headers)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("image/")


@pytest.mark.asyncio
async def test_video_lab_event_has_media(client: AsyncClient, auth_headers: dict, tmp_path: Path) -> None:
    fixture = tmp_path / "lab_media.mp4"
    _write_moving_mp4(fixture, frames=40, fps=10.0)

    with fixture.open("rb") as fh:
        upload = await client.post(
            "/api/v1/video-lab/assets",
            headers=auth_headers,
            files={"file": ("lab_media.mp4", fh, "video/mp4")},
            data={"name_he": "מדיה", "location": "מעבדה"},
        )
    assert upload.status_code == 200, upload.text
    asset = upload.json()
    camera_id = asset["camera_id"]

    zone = await client.post(
        f"/api/v1/cameras/{camera_id}/zones",
        headers=auth_headers,
        json={
            "name": "כל המסך",
            "kind": "polygon",
            "points": [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]],
            "enabled": True,
        },
    )
    assert zone.status_code in (200, 201), zone.text
    zone_id = zone.json()["id"]

    rule = await client.post(
        "/api/v1/rules",
        headers=auth_headers,
        json={
            "name": "person zone",
            "enabled": True,
            "conditions": {
                "object_classes": ["person"],
                "camera_id": camera_id,
                "zone_id": zone_id,
                "schedule": {"from": "00:00", "to": "23:59"},
            },
            "actions": [{"type": "create_event", "severity": "warning"}],
            "cooldown_seconds": 0,
            "min_duration_seconds": 0,
        },
    )
    assert rule.status_code in (200, 201), rule.text

    analyze = await client.post(
        f"/api/v1/video-lab/assets/{asset['id']}/analyze",
        headers=auth_headers,
        json={"block": True},
    )
    assert analyze.status_code == 200, analyze.text
    job = analyze.json()
    assert job["status"] == "completed"
    assert job.get("event_ids")

    events = await client.get("/api/v1/events", headers=auth_headers)
    assert events.status_code == 200
    matched = [e for e in events.json() if e["id"] in job["event_ids"]]
    assert matched
    ev = matched[0]
    assert ev.get("has_snapshot") is True
    assert ev.get("trigger_timestamp_sec") is not None
    assert ev.get("media_status") in {"complete", "snapshot_only", "failed"}

    snap = await client.get(f"/api/v1/events/{ev['id']}/snapshot", headers=auth_headers)
    assert snap.status_code == 200
    assert snap.headers["content-type"].startswith("image/")
