"""Unit tests for schedule and rule engine."""

from __future__ import annotations

from datetime import UTC, datetime

from app.domain.rules.engine import DetectionContext, RuleSnapshot, evaluate_rule
from app.domain.rules.schedule import is_within_schedule


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 10, 5, hour, minute, tzinfo=UTC)


def test_schedule_same_day_inside() -> None:
    assert is_within_schedule(_dt(10), {"from": "08:00", "to": "18:00"}) is True


def test_schedule_same_day_outside() -> None:
    assert is_within_schedule(_dt(20), {"from": "08:00", "to": "18:00"}) is False


def test_schedule_cross_midnight_late_night() -> None:
    assert is_within_schedule(_dt(23), {"from": "22:00", "to": "06:00"}) is True


def test_schedule_cross_midnight_early_morning() -> None:
    assert is_within_schedule(_dt(3), {"from": "22:00", "to": "06:00"}) is True


def test_schedule_cross_midnight_afternoon_outside() -> None:
    assert is_within_schedule(_dt(15), {"from": "22:00", "to": "06:00"}) is False


def test_schedule_days_filter() -> None:
    # 2026-10-05 is Monday (weekday=0)
    assert is_within_schedule(_dt(10), {"from": "00:00", "to": "23:59", "days": [0]}) is True
    assert is_within_schedule(_dt(10), {"from": "00:00", "to": "23:59", "days": [2]}) is False


def _rule(**overrides) -> RuleSnapshot:
    base = {
        "id": "rule_1",
        "name": "test",
        "enabled": True,
        "conditions": {
            "object_classes": ["person"],
            "camera_id": "cam_01",
            "zone_id": "warehouse",
            "min_duration_seconds": 30,
            "schedule": {"from": "22:00", "to": "06:00"},
        },
        "actions": [{"type": "push_notification"}],
        "cooldown_seconds": 120,
        "last_triggered_at": None,
    }
    base.update(overrides)
    return RuleSnapshot(**base)


def _ctx(**overrides) -> DetectionContext:
    base = {
        "camera_id": "cam_01",
        "object_class": "person",
        "track_id": 1,
        "confidence": 0.9,
        "timestamp": _dt(23),
        "active_zone_ids": frozenset({"warehouse"}),
        "zone_durations": {"warehouse": 35.0},
        "camera_enabled": True,
        "enabled_zone_ids": frozenset({"warehouse"}),
    }
    base.update(overrides)
    return DetectionContext(**base)


def test_rule_matches_when_all_conditions_met() -> None:
    assert evaluate_rule(_rule(), _ctx()) is not None


def test_rule_rejects_wrong_object_class() -> None:
    assert evaluate_rule(_rule(), _ctx(object_class="dog")) is None


def test_rule_rejects_insufficient_duration() -> None:
    assert evaluate_rule(_rule(), _ctx(zone_durations={"warehouse": 10.0})) is None


def test_rule_rejects_outside_schedule() -> None:
    assert evaluate_rule(_rule(), _ctx(timestamp=_dt(15))) is None


def test_rule_rejects_disabled_rule() -> None:
    assert evaluate_rule(_rule(enabled=False), _ctx()) is None


def test_rule_rejects_disabled_camera() -> None:
    assert evaluate_rule(_rule(), _ctx(camera_enabled=False)) is None


def test_rule_rejects_disabled_zone() -> None:
    assert evaluate_rule(_rule(), _ctx(enabled_zone_ids=frozenset())) is None


def test_rule_respects_cooldown() -> None:
    last = _dt(22, 50)
    rule = _rule(last_triggered_at=last, cooldown_seconds=120)
    # 60 seconds later — still in cooldown
    assert evaluate_rule(rule, _ctx(timestamp=_dt(22, 51))) is None
    # 3 minutes later — ok
    assert evaluate_rule(rule, _ctx(timestamp=_dt(22, 53))) is not None
