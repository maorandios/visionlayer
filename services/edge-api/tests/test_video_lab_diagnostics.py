"""Unit tests for Video Lab rule diagnostics."""

from __future__ import annotations

from types import SimpleNamespace

from app.domain.video_lab.diagnostics import (
    build_focus_timeline,
    diagnose_rules,
    first_seen_by_class,
)


def test_first_seen_by_class_uses_video_relative_time() -> None:
    base = 1_700_000_000.0
    dets = [
        {
            "class": "person",
            "timestamp": base + 0.5,
            "track_id": 1,
            "confidence": 0.9,
            "bbox": [10, 10, 20, 40],
        },
        {
            "class": "bicycle",
            "timestamp": base + 2.0,
            "track_id": 2,
            "confidence": 0.8,
            "bbox": [30, 30, 50, 60],
        },
        {
            "class": "bicycle",
            "timestamp": base + 3.0,
            "track_id": 2,
            "confidence": 0.7,
            "bbox": [32, 30, 52, 60],
        },
    ]
    seen = first_seen_by_class(dets, base_unix_ts=base)
    assert seen["person"]["timestamp_sec"] == 0.5
    assert seen["bicycle"]["timestamp_sec"] == 2.0
    assert seen["bicycle"]["class_he"] == "אופניים"


def test_diagnose_object_not_detected() -> None:
    rule = SimpleNamespace(
        id="r1",
        name="אופניים באזור",
        enabled=True,
        conditions_json={
            "object_classes": ["bicycle"],
            "camera_id": "cam1",
            "zone_id": "z1",
            "min_duration_seconds": 0,
            "schedule": {"from": "00:00", "to": "23:59"},
        },
    )
    zone = SimpleNamespace(
        id="z1",
        name="מרכז",
        enabled=True,
        kind="polygon",
        points_json=[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
    )
    checks = diagnose_rules(
        camera_id="cam1",
        rules=[rule],
        zones=[zone],
        detections=[
            {
                "class": "person",
                "timestamp": 100.0,
                "track_id": 1,
                "bbox": [10, 10, 40, 80],
                "frame_size": [100, 100],
            }
        ],
        base_unix_ts=100.0,
        triggered_rule_ids=set(),
    )
    assert len(checks) == 1
    assert checks[0]["status"] == "object_not_detected"
    assert "אופניים" in checks[0]["reason_he"]


def test_diagnose_in_zone_and_focus_timeline() -> None:
    rule = SimpleNamespace(
        id="r1",
        name="אופניים באזור",
        enabled=True,
        conditions_json={
            "object_classes": ["bicycle"],
            "camera_id": "cam1",
            "zone_id": "z1",
            "min_duration_seconds": 0,
            "schedule": {"from": "00:00", "to": "23:59"},
        },
    )
    zone = SimpleNamespace(
        id="z1",
        name="מרכז",
        enabled=True,
        kind="polygon",
        points_json=[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
    )
    base = 1000.0
    dets = [
        {
            "class": "bicycle",
            "timestamp": base + 1.5,
            "track_id": 7,
            "bbox": [20, 20, 40, 50],
            "frame_size": [100, 100],
            "confidence": 0.9,
        }
    ]
    checks = diagnose_rules(
        camera_id="cam1",
        rules=[rule],
        zones=[zone],
        detections=dets,
        base_unix_ts=base,
        triggered_rule_ids={"r1"},
    )
    assert checks[0]["status"] == "triggered"
    assert checks[0]["first_in_zone_sec"] == 1.5

    timeline = build_focus_timeline(
        first_seen=first_seen_by_class(dets, base_unix_ts=base),
        hits=[
            {
                "timestamp_sec": 1.5,
                "rule_name": "אופניים באזור",
                "object_class_he": "אופניים",
                "object_class": "bicycle",
                "event_id": "e1",
                "rule_id": "r1",
            }
        ],
        rule_checks=checks,
    )
    assert any(i["kind"] == "first_seen" for i in timeline)
    assert any(i["kind"] == "event" for i in timeline)
