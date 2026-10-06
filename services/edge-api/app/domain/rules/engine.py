"""Pure Rule Engine — no I/O, unit-testable."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.domain.rules.schedule import is_within_schedule


@dataclass(frozen=True, slots=True)
class RuleMatch:
    rule_id: str
    rule_name: str
    zone_id: str
    duration_seconds: float
    message_he: str
    severity: str = "warning"
    event_type: str = "rule_match"


@dataclass(frozen=True, slots=True)
class RuleSnapshot:
    id: str
    name: str
    enabled: bool
    conditions: dict[str, Any]
    actions: list[dict[str, Any]]
    cooldown_seconds: int
    last_triggered_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class DetectionContext:
    camera_id: str
    object_class: str
    track_id: int | None
    confidence: float
    timestamp: datetime
    active_zone_ids: frozenset[str]
    zone_durations: dict[str, float]
    camera_enabled: bool
    enabled_zone_ids: frozenset[str]


_CLASS_HE = {
    "person": "אדם",
    "car": "רכב",
    "truck": "משאית",
    "bus": "אוטובוס",
    "dog": "כלב",
    "cat": "חתול",
    "bicycle": "אופניים",
    "motorcycle": "אופנוע",
}


def _class_he(object_class: str) -> str:
    return _CLASS_HE.get(object_class, object_class)


def _cooldown_ok(rule: RuleSnapshot, now: datetime) -> bool:
    if rule.cooldown_seconds <= 0 or rule.last_triggered_at is None:
        return True
    last = rule.last_triggered_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=UTC)
    elapsed = (now - last).total_seconds()
    return elapsed >= rule.cooldown_seconds


def evaluate_rule(rule: RuleSnapshot, ctx: DetectionContext) -> RuleMatch | None:
    """Evaluate a single rule against detection context. Returns match or None."""
    if not rule.enabled:
        return None
    if not ctx.camera_enabled:
        return None
    if ctx.track_id is None:
        return None

    conditions = rule.conditions
    object_classes = conditions.get("object_classes") or []
    if object_classes and ctx.object_class not in object_classes:
        return None

    camera_id = conditions.get("camera_id")
    if camera_id and camera_id != ctx.camera_id:
        return None

    zone_id = conditions.get("zone_id")
    if not zone_id:
        return None
    if zone_id not in ctx.enabled_zone_ids:
        return None
    if zone_id not in ctx.active_zone_ids:
        return None

    schedule = conditions.get("schedule")
    if not is_within_schedule(ctx.timestamp, schedule):
        return None

    min_duration = int(conditions.get("min_duration_seconds") or 0)
    duration = ctx.zone_durations.get(zone_id)
    if duration is None:
        return None
    if duration < min_duration:
        return None

    if not _cooldown_ok(rule, ctx.timestamp):
        return None

    # Require at least one actionable action (push is config-only in Phase 1)
    if not rule.actions:
        return None

    message = (
        f"{_class_he(ctx.object_class)} נמצא באזור "
        f"{zone_id} למשך {int(duration)} שניות"
    )
    return RuleMatch(
        rule_id=rule.id,
        rule_name=rule.name,
        zone_id=zone_id,
        duration_seconds=duration,
        message_he=message,
    )


def evaluate_rules(rules: list[RuleSnapshot], ctx: DetectionContext) -> list[RuleMatch]:
    matches: list[RuleMatch] = []
    for rule in rules:
        match = evaluate_rule(rule, ctx)
        if match is not None:
            matches.append(match)
    return matches
