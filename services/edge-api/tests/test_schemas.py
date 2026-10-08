"""Shared schema validation tests (Phase 0)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = REPO_ROOT / "shared" / "schemas"


def _load(name: str) -> dict:
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


def _validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(_load(name))


def test_all_schemas_are_valid_meta() -> None:
    for path in SCHEMAS.glob("*.schema.json"):
        schema = json.loads(path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)


def test_detection_schema_accepts_valid_payload() -> None:
    payload = {
        "type": "detection",
        "schema_version": "1.0",
        "camera_id": "cam_01",
        "class": "person",
        "confidence": 0.97,
        "bbox": [120, 80, 420, 360],
        "track_id": 42,
        "timestamp": 1728123456.123,
        "frame_size": [1920, 1080],
        "frame_index": 10,
        "video_timestamp_sec": 0.4,
        "source": "mock",
    }
    _validator("detection.schema.json").validate(payload)


def test_detection_schema_rejects_bad_confidence() -> None:
    payload = {
        "type": "detection",
        "schema_version": "1.0",
        "camera_id": "cam_01",
        "class": "person",
        "confidence": 1.5,
        "bbox": [0, 0, 10, 10],
        "timestamp": 1,
        "source": "mock",
    }
    with pytest.raises(ValidationError):
        _validator("detection.schema.json").validate(payload)


def test_rule_schema_accepts_night_warehouse_example() -> None:
    payload = {
        "name": "אדם באזור המחסן בלילה",
        "enabled": True,
        "conditions": {
            "object_classes": ["person"],
            "zone_id": "warehouse",
            "schedule": {"from": "22:00", "to": "06:00"},
            "min_duration_seconds": 30,
        },
        "actions": [{"type": "push_notification"}],
    }
    _validator("rule.schema.json").validate(payload)


def test_event_schema_accepts_valid_payload() -> None:
    payload = {
        "id": "evt_01",
        "schema_version": "1.0",
        "type": "zone_enter",
        "severity": "warning",
        "camera_id": "cam_01",
        "started_at": "2026-10-05T06:00:00Z",
        "state": "new",
        "message_he": "אדם נכנס לאזור המחסן",
        "payload": {},
    }
    _validator("event.schema.json").validate(payload)


def test_skill_manifest_schema_accepts_valid_payload() -> None:
    payload = {
        "id": "truck-counter",
        "name_he": "מונה משאיות",
        "version": "1.0.0",
        "requires": ["detection", "tracking", "line_crossing"],
        "outputs": ["truck_count", "truck_entry_event", "daily_metric"],
        "config_schema": {"type": "object"},
    }
    _validator("skill.manifest.schema.json").validate(payload)


def test_metric_schema_accepts_valid_payload() -> None:
    payload = {
        "schema_version": "1.0",
        "name": "truck_count",
        "value": 12,
        "unit": "count",
        "timestamp": 1728123456.0,
        "camera_id": "cam_01",
        "labels": {"direction": "a_to_b"},
    }
    _validator("metric.schema.json").validate(payload)


def test_counter_state_schema_accepts_valid_payload() -> None:
    payload = {
        "schema_version": "1.0",
        "counter_id": "gate_trucks",
        "value": 3,
        "updated_at": "2026-10-05T06:00:00Z",
        "direction": "a_to_b",
    }
    _validator("counter_state.schema.json").validate(payload)


def test_vision_capabilities_schema_accepts_valid_payload() -> None:
    payload = {
        "schema_version": "1.0",
        "adapter": "mock",
        "capabilities": ["detection", "tracking"],
        "supported_classes": ["person", "car"],
        "max_cameras": 16,
    }
    _validator("vision_capabilities.schema.json").validate(payload)
