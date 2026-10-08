"""ExecutionPlan compilation + debug-mode config semantics."""

from __future__ import annotations

from types import SimpleNamespace

from app.domain.video_lab.execution_plans import (
    compile_metric_execution_plan,
    compile_rule_execution_plan,
    expand_object_classes,
    resolve_classes_for_object_type,
    vehicle_group_resolution,
)
from app.domain.video_lab.debug_config import (
    DEBUG_CONF_THRESHOLD,
    DEBUG_FRAME_STRIDE,
    DEBUG_SEARCH_CLASSES,
)


def test_vehicle_group_resolves_four_classes() -> None:
    assert resolve_classes_for_object_type("vehicle") == ["bus", "car", "motorcycle", "truck"]
    assert set(vehicle_group_resolution()["resolved_classes"]) == {
        "car",
        "truck",
        "bus",
        "motorcycle",
    }
    assert expand_object_classes(["vehicle"]) == ["bus", "car", "motorcycle", "truck"]


def test_rule_plan_vehicle_entry_line() -> None:
    rule = SimpleNamespace(
        id="r1",
        name="רכב נכנס דרך שער",
        enabled=True,
        cooldown_seconds=0,
        conditions_json={
            "object_classes": ["car", "truck", "bus", "motorcycle"],
            "camera_id": "cam_1",
            "trigger": "line_cross",
            "line_id": "gate_a",
            "direction": "a_to_b",
        },
    )
    plan = compile_rule_execution_plan(rule)
    assert plan.object_classes == ["bus", "car", "motorcycle", "truck"]
    assert plan.object_type_resolved_from == "vehicle"
    assert plan.trigger_type == "line_cross"
    assert plan.spatial_mode == "line"
    assert plan.line_id == "gate_a"
    assert plan.direction == "a_to_b"
    assert plan.tracking_required is True


def test_rule_plan_person_dwell_zone() -> None:
    rule = SimpleNamespace(
        id="r2",
        name="אדם שוהה",
        enabled=True,
        cooldown_seconds=30,
        conditions_json={
            "object_classes": ["person"],
            "camera_id": "cam_1",
            "trigger": "dwell",
            "zone_id": "zone_a",
            "min_duration_seconds": 30,
        },
    )
    plan = compile_rule_execution_plan(rule)
    assert plan.trigger_type == "dwell"
    assert plan.zone_id == "zone_a"
    assert plan.dwell_seconds == 30
    assert plan.spatial_mode == "zone"
    assert plan.dedupe_mode == "cooldown"


def test_metric_plan_entries_line_based() -> None:
    md = SimpleNamespace(
        id="m1",
        name="כניסות רכבים",
        camera_id="cam_1",
        metric_type="entries",
        object_type="vehicle",
        object_classes_json=[],
        zone_id=None,
        line_id="gate_a",
        direction="a_to_b",
        enabled=True,
        scope_type="line",
    )
    plan = compile_metric_execution_plan(md)
    assert plan.object_classes == ["bus", "car", "motorcycle", "truck"]
    assert plan.metric_type == "entries"
    assert plan.spatial_mode == "line"
    assert plan.line_id == "gate_a"
    assert plan.engine_metric_type == "line_crossings"
    assert "כניסה" in plan.semantics_he or "inward" in plan.semantics_he


def test_debug_mode_defaults() -> None:
    assert DEBUG_FRAME_STRIDE == 1
    assert 0.25 <= DEBUG_CONF_THRESHOLD <= 0.30
    assert set(DEBUG_SEARCH_CLASSES) == {
        "person",
        "car",
        "truck",
        "bus",
        "motorcycle",
        "bicycle",
    }
