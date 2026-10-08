"""Architecture cleanup: Vision boundary, Detection contract, Event run id, class map."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select

REPO = Path(__file__).resolve().parents[3]
VISION = REPO / "services" / "vision"
if str(VISION) not in sys.path:
    sys.path.insert(0, str(VISION))


def test_detection_contract_accepts_canonical_payload() -> None:
    from detection_contract import build_detection, validate_detection

    det = build_detection(
        camera_id="cam",
        class_name="car",
        confidence=0.5,
        bbox=[1, 2, 3, 4],
        timestamp=1_700_000_000.0,
        source="mock",
        track_id=7,
        frame_size=(640, 360),
        frame_index=12,
        video_timestamp_sec=1.25,
    )
    validate_detection(det)
    assert det["frame_index"] == 12
    assert det["video_timestamp_sec"] == 1.25


def test_detection_contract_rejects_numeric_leaking_as_class() -> None:
    from detection_contract import DetectionContractError, validate_detection

    with pytest.raises(DetectionContractError):
        validate_detection(
            {
                "type": "detection",
                "schema_version": "1.0",
                "camera_id": "c",
                "class": "2",
                "confidence": 0.9,
                "bbox": [0, 0, 10, 10],
                "timestamp": 1.0,
                "source": "mock",
            }
        )


def test_detection_schema_json_includes_frame_index() -> None:
    import json

    schema = json.loads((REPO / "shared" / "schemas" / "detection.schema.json").read_text(encoding="utf-8"))
    assert "frame_index" in schema["properties"]
    assert "video_timestamp_sec" in schema["properties"]
    from jsonschema import Draft202012Validator

    Draft202012Validator(schema).validate(
        {
            "type": "detection",
            "schema_version": "1.0",
            "camera_id": "cam_01",
            "class": "person",
            "confidence": 0.97,
            "bbox": [120, 80, 420, 360],
            "track_id": 42,
            "timestamp": 1728123456.123,
            "video_timestamp_sec": 3.5,
            "frame_index": 42,
            "frame_size": [1920, 1080],
            "source": "mock",
        }
    )


def test_class_mapping_vehicle_group_and_coco_ids() -> None:
    from class_mapping import map_native_class_id, map_native_class_name

    from app.domain.vision_capabilities import VEHICLE_CLASSES, resolve_object_classes

    assert set(resolve_object_classes("vehicle")) == set(VEHICLE_CLASSES)
    assert "bicycle" not in VEHICLE_CLASSES
    assert map_native_class_id(2) == "car"
    assert map_native_class_id(3) == "motorcycle"
    assert map_native_class_name("motorbike") == "motorcycle"
    assert map_native_class_id(99) is None


def test_fake_backend_emits_valid_contract() -> None:
    from adapters.fake import emit_scripted_detections
    from boundary import analyze_detections_batch
    from detection_contract import validate_detections

    dets = emit_scripted_detections(camera_id="cam_fake")
    validate_detections(dets)
    assert analyze_detections_batch(dets) == dets
    assert all(d["source"] == "mock" for d in dets)
    assert all("frame_index" in d for d in dets)


@pytest.mark.asyncio
async def test_event_source_analysis_run_id_at_creation(
    client: AsyncClient, auth_headers: dict
) -> None:
    """Run ownership is stamped when the Event row is created — before media."""
    from adapters.fake import emit_scripted_detections

    from app.adapters.db import get_session_factory
    from app.adapters.models import Camera, Event, Line, Rule
    from app.domain.pipeline.detection_pipeline import DetectionPipeline
    from app.domain.rules.tracker import ZonePresenceTracker
    from app.domain.spatial.line_tracker import LineCrossingTracker

    factory = get_session_factory()
    async with factory() as session:
        cam = Camera(id="cam_arch_run", name="Arch", enabled=True, status="online")
        session.add(cam)
        session.add(
            Line(
                id="ln_arch",
                camera_id=cam.id,
                name="Gate",
                points_json=[[0.2, 0.5], [0.8, 0.5]],
                direction="any",
                enabled=True,
            )
        )
        session.add(
            Rule(
                id="rule_arch_line",
                name="car cross",
                enabled=True,
                conditions_json={
                    "object_classes": ["car"],
                    "camera_id": cam.id,
                    "trigger": "line_cross",
                    "line_id": "ln_arch",
                    "direction": "any",
                },
                actions_json=[{"type": "create_event"}],
                cooldown_seconds=0,
            )
        )
        await session.commit()

    pipeline = DetectionPipeline(
        factory,
        tracker=ZonePresenceTracker(),
        line_tracker=LineCrossingTracker(min_cross_interval_sec=0.05),
    )
    dets = emit_scripted_detections(camera_id="cam_arch_run", base_unix_ts=1_700_000_000.0)
    run_a = "run_arch_A"
    ids = await pipeline.handle_batch(
        dets,
        once_per_track=True,
        metrics_scope="video_lab",
        analysis_run_id=run_a,
        finalize=True,
    )
    assert ids, "expected at least one event from fake car crossing"

    async with factory() as session:
        rows = (await session.execute(select(Event).where(Event.id.in_(ids)))).scalars().all()
        assert rows
        for row in rows:
            assert row.source_analysis_run_id == run_a

    pipeline2 = DetectionPipeline(
        factory,
        tracker=ZonePresenceTracker(),
        line_tracker=LineCrossingTracker(min_cross_interval_sec=0.05),
    )
    run_b = "run_arch_B"
    dets_b = emit_scripted_detections(camera_id="cam_arch_run", base_unix_ts=1_700_000_100.0)
    ids_b = await pipeline2.handle_batch(
        dets_b,
        once_per_track=True,
        metrics_scope="video_lab",
        analysis_run_id=run_b,
        finalize=True,
    )
    async with factory() as session:
        rows_b = (await session.execute(select(Event).where(Event.id.in_(ids_b)))).scalars().all()
        assert rows_b
        for row in rows_b:
            assert row.source_analysis_run_id == run_b


@pytest.mark.asyncio
async def test_fake_backend_swap_drives_product_pipeline(
    client: AsyncClient, auth_headers: dict
) -> None:
    from adapters.fake import emit_scripted_detections
    from detection_contract import build_detection

    from app.adapters.db import get_session_factory
    from app.adapters.models import Camera, Event, Line, Rule
    from app.domain.pipeline.detection_pipeline import DetectionPipeline
    from app.domain.rules.tracker import ZonePresenceTracker
    from app.domain.spatial.line_tracker import LineCrossingTracker

    factory = get_session_factory()
    cam_id = "cam_swap"
    async with factory() as session:
        session.add(Camera(id=cam_id, name="Swap", enabled=True, status="online"))
        session.add(
            Line(
                id="ln_swap",
                camera_id=cam_id,
                name="L",
                points_json=[[0.2, 0.5], [0.8, 0.5]],
                direction="any",
                enabled=True,
            )
        )
        session.add(
            Rule(
                id="rule_swap",
                name="cross",
                enabled=True,
                conditions_json={
                    "object_classes": ["car"],
                    "camera_id": cam_id,
                    "trigger": "line_cross",
                    "line_id": "ln_swap",
                    "direction": "any",
                },
                actions_json=[{"type": "create_event"}],
                cooldown_seconds=0,
            )
        )
        await session.commit()

    fake = [d for d in emit_scripted_detections(camera_id=cam_id) if d["track_id"] == 1]
    base = 1_700_000_000.0
    manual = [
        build_detection(
            camera_id=cam_id,
            class_name="car",
            confidence=0.9,
            bbox=bbox,
            timestamp=base + t,
            source="development_video",
            track_id=1,
            frame_size=(200, 100),
            frame_index=i,
            video_timestamp_sec=t,
        )
        for i, t, bbox in [
            (0, 0.0, [40.0, 60.0, 80.0, 80.0]),
            (1, 0.2, [40.0, 55.0, 80.0, 70.0]),
            (2, 0.4, [40.0, 20.0, 80.0, 30.0]),
            (3, 0.6, [40.0, 10.0, 80.0, 20.0]),
        ]
    ]

    async def run(dets: list, run_id: str) -> int:
        pipe = DetectionPipeline(
            factory,
            tracker=ZonePresenceTracker(),
            line_tracker=LineCrossingTracker(min_cross_interval_sec=0.05),
        )
        ids = await pipe.handle_batch(
            dets,
            once_per_track=True,
            metrics_scope="video_lab",
            analysis_run_id=run_id,
            finalize=True,
        )
        return len(ids)

    n_fake = await run(fake, "run_fake")
    n_manual = await run(manual, "run_manual")
    assert n_fake == n_manual >= 1

    async with factory() as session:
        events = (await session.execute(select(Event).where(Event.camera_id == cam_id))).scalars().all()
        assert all(e.source_analysis_run_id in {"run_fake", "run_manual"} for e in events)


def test_product_does_not_import_yolox_classes() -> None:
    root = Path(__file__).resolve().parents[1] / "app"
    offenders: list[str] = []
    for path in root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "YoloxOnnxDetector" in text or "ByteTrackAdapter" in text or "import onnxruntime" in text:
            offenders.append(str(path.relative_to(root)))
    assert offenders == []


def test_official_boundary_module_exists() -> None:
    import boundary

    caps = boundary.vision_capabilities()
    assert caps["active_backend"] == "development"
    assert caps["backends"]["deepstream"]["implemented"] is False
    health = boundary.vision_health()
    assert health["healthy"] is True


def test_video_lab_service_imports_boundary_not_yolox() -> None:
    src = (Path(__file__).resolve().parents[1] / "app" / "domain" / "video_lab" / "service.py").read_text(
        encoding="utf-8"
    )
    assert "from boundary import" in src
    assert "analyze_uploaded_video" in src
    assert "YoloxOnnxDetector" not in src
