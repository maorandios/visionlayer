"""Pure Rule Engine — spatial events + legacy presence. No I/O."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.domain.counters import compare_threshold
from app.domain.rules.schedule import is_within_schedule
from app.domain.spatial import SpatialEvent
from app.domain.spatial.lines import direction_matches


@dataclass(frozen=True, slots=True)
class RuleMatch:
    rule_id: str
    rule_name: str
    zone_id: str | None
    duration_seconds: float
    message_he: str
    severity: str = "warning"
    event_type: str = "rule_match"
    line_id: str | None = None
    spatial_event: str | None = None
    direction: str | None = None
    count: int | None = None
    threshold: float | None = None
    window_seconds: int | None = None
    operator: str | None = None
    dedupe_key: str = ""


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
    # Optional catalogs for Hebrew messages
    zone_names: dict[str, str] | None = None
    line_names: dict[str, str] | None = None
    # Spatial events observed on this detection frame for this track
    spatial_events: tuple[SpatialEvent, ...] = ()
    # Running unique counts keyed by counter_key (filled by pipeline for count rules)
    counter_values: dict[str, int] | None = None
    threshold_fires: dict[str, dict[str, Any]] | None = None


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

_CLASS_HE_PLURAL = {
    "person": "אנשים",
    "car": "רכבים",
    "truck": "משאיות",
    "bus": "אוטובוסים",
    "bicycle": "אופניים",
    "motorcycle": "אופנועים",
}


def class_he(object_class: str) -> str:
    return _CLASS_HE.get(object_class, object_class)


def class_he_plural(object_class: str) -> str:
    return _CLASS_HE_PLURAL.get(object_class, class_he(object_class))


def infer_trigger(conditions: dict[str, Any]) -> str:
    """Resolve rule trigger type; preserve legacy zone presence when unset."""
    explicit = conditions.get("trigger")
    if isinstance(explicit, str) and explicit:
        return explicit
    if conditions.get("line_id"):
        return "line_cross"
    if (
        conditions.get("threshold") is not None
        or conditions.get("count") is not None
        or conditions.get("aggregation_window_seconds")
        or conditions.get("aggregation")
    ):
        return "count_threshold"
    # Legacy: zone + duration ⇒ presence/dwell semantics (same evaluate path)
    return "zone_presence"


def _cooldown_ok(rule: RuleSnapshot, now: datetime) -> bool:
    if rule.cooldown_seconds <= 0 or rule.last_triggered_at is None:
        return True
    last = rule.last_triggered_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=UTC)
    elapsed = (now - last).total_seconds()
    return elapsed >= rule.cooldown_seconds


def _zone_label(ctx: DetectionContext, zone_id: str | None) -> str:
    if not zone_id:
        return "אזור"
    names = ctx.zone_names or {}
    return names.get(zone_id, zone_id)


def _line_label(ctx: DetectionContext, line_id: str | None) -> str:
    if not line_id:
        return "קו"
    names = ctx.line_names or {}
    return names.get(line_id, line_id)


def _base_gate(rule: RuleSnapshot, ctx: DetectionContext) -> bool:
    if not rule.enabled or not ctx.camera_enabled or ctx.track_id is None:
        return False
    if not rule.actions:
        return False
    conditions = rule.conditions
    object_classes = conditions.get("object_classes") or []
    if object_classes and ctx.object_class not in object_classes:
        return False
    camera_id = conditions.get("camera_id")
    if camera_id and camera_id != ctx.camera_id:
        return False
    if not is_within_schedule(ctx.timestamp, conditions.get("schedule")):
        return False
    if not _cooldown_ok(rule, ctx.timestamp):
        return False
    return True


def _match_zone_presence(rule: RuleSnapshot, ctx: DetectionContext) -> RuleMatch | None:
    """Legacy dwell/presence: currently inside zone with duration ≥ min."""
    conditions = rule.conditions
    zone_id = conditions.get("zone_id")
    if not zone_id:
        return None
    if zone_id not in ctx.enabled_zone_ids or zone_id not in ctx.active_zone_ids:
        return None
    min_duration = int(conditions.get("min_duration_seconds") or 0)
    duration = ctx.zone_durations.get(zone_id)
    if duration is None or duration < min_duration:
        return None
    message = (
        f"{class_he(ctx.object_class)} נמצא באזור "
        f"{_zone_label(ctx, zone_id)} למשך {int(duration)} שניות"
    )
    return RuleMatch(
        rule_id=rule.id,
        rule_name=rule.name,
        zone_id=zone_id,
        duration_seconds=duration,
        message_he=message,
        event_type="rule_match",
        spatial_event="zone_presence",
        dedupe_key=f"{rule.id}:{ctx.track_id}:presence",
    )


def _find_spatial(
    ctx: DetectionContext,
    *,
    kind: str,
    zone_id: str | None = None,
    line_id: str | None = None,
) -> SpatialEvent | None:
    for ev in ctx.spatial_events:
        if ev.kind != kind:
            continue
        if zone_id is not None and ev.zone_id != zone_id:
            continue
        if line_id is not None and ev.line_id != line_id:
            continue
        return ev
    return None


def _match_zone_enter(rule: RuleSnapshot, ctx: DetectionContext) -> RuleMatch | None:
    zone_id = rule.conditions.get("zone_id")
    if not zone_id or zone_id not in ctx.enabled_zone_ids:
        return None
    ev = _find_spatial(ctx, kind="zone_enter", zone_id=zone_id)
    if ev is None:
        return None
    return RuleMatch(
        rule_id=rule.id,
        rule_name=rule.name,
        zone_id=zone_id,
        duration_seconds=0.0,
        message_he=f"{class_he(ctx.object_class)} נכנס לאזור {_zone_label(ctx, zone_id)}",
        event_type="zone_enter",
        spatial_event="zone_enter",
        dedupe_key=f"{rule.id}:{ev.occurrence_id}",
    )


def _match_zone_exit(rule: RuleSnapshot, ctx: DetectionContext) -> RuleMatch | None:
    zone_id = rule.conditions.get("zone_id")
    if not zone_id or zone_id not in ctx.enabled_zone_ids:
        return None
    ev = _find_spatial(ctx, kind="zone_exit", zone_id=zone_id)
    if ev is None:
        return None
    return RuleMatch(
        rule_id=rule.id,
        rule_name=rule.name,
        zone_id=zone_id,
        duration_seconds=float(ev.duration_seconds or 0),
        message_he=f"{class_he(ctx.object_class)} יצא מאזור {_zone_label(ctx, zone_id)}",
        event_type="zone_exit",
        spatial_event="zone_exit",
        dedupe_key=f"{rule.id}:{ev.occurrence_id}",
    )


def _match_dwell(rule: RuleSnapshot, ctx: DetectionContext) -> RuleMatch | None:
    zone_id = rule.conditions.get("zone_id")
    if not zone_id or zone_id not in ctx.enabled_zone_ids:
        return None
    min_duration = int(rule.conditions.get("min_duration_seconds") or 0)
    ev = _find_spatial(ctx, kind="dwell_threshold_reached", zone_id=zone_id)
    if ev is None:
        # Fallback: presence duration just crossed (if spatial not tagged)
        duration = ctx.zone_durations.get(zone_id)
        if duration is None or duration < min_duration:
            return None
        # Without dwell event, only fire via spatial to avoid spam
        return None
    duration = float(ev.duration_seconds or min_duration)
    return RuleMatch(
        rule_id=rule.id,
        rule_name=rule.name,
        zone_id=zone_id,
        duration_seconds=duration,
        message_he=(
            f"{class_he(ctx.object_class)} שהה באזור {_zone_label(ctx, zone_id)} "
            f"יותר מ־{min_duration} שניות"
        ),
        event_type="dwell",
        spatial_event="dwell_threshold_reached",
        dedupe_key=f"{rule.id}:{ev.occurrence_id}",
    )


def _match_line_cross(rule: RuleSnapshot, ctx: DetectionContext) -> RuleMatch | None:
    line_id = rule.conditions.get("line_id")
    if not line_id:
        return None
    ev = _find_spatial(ctx, kind="line_cross", line_id=line_id)
    if ev is None or not ev.direction:
        return None
    required = rule.conditions.get("direction") or "any"
    if not direction_matches(ev.direction, required):
        return None
    dir_he = {
        "a_to_b": "בכיוון A→B",
        "b_to_a": "בכיוון B→A",
    }.get(ev.direction, "")
    suffix = f" {dir_he}" if required != "any" and dir_he else ""
    return RuleMatch(
        rule_id=rule.id,
        rule_name=rule.name,
        zone_id=None,
        line_id=line_id,
        duration_seconds=0.0,
        message_he=(
            f"{class_he(ctx.object_class)} חצה את {_line_label(ctx, line_id)}{suffix}"
        ).strip(),
        event_type="line_cross",
        spatial_event="line_cross",
        direction=ev.direction,
        dedupe_key=f"{rule.id}:{ev.occurrence_id}",
    )


def aggregation_from_conditions(conditions: dict[str, Any]) -> dict[str, Any]:
    raw = conditions.get("aggregation")
    if isinstance(raw, dict):
        return {
            "metric": raw.get("metric") or "unique_objects",
            "window_seconds": raw.get("window_seconds"),
            "operator": raw.get("operator") or "gte",
            "threshold": raw.get("threshold"),
        }
    return {
        "metric": "unique_objects",
        "window_seconds": conditions.get("aggregation_window_seconds"),
        "operator": conditions.get("operator") or "gte",
        "threshold": conditions.get("threshold", conditions.get("count")),
    }


# Back-compat private alias
_aggregation = aggregation_from_conditions



def counter_key_for_rule(rule: RuleSnapshot, ctx: DetectionContext) -> str:
    c = rule.conditions
    parts = [
        "cnt",
        rule.id,
        ctx.camera_id,
        str(c.get("zone_id") or ""),
        str(c.get("line_id") or ""),
        ctx.object_class,
        str(c.get("direction") or "any"),
    ]
    return "|".join(parts)


def _match_count_threshold(rule: RuleSnapshot, ctx: DetectionContext) -> RuleMatch | None:
    agg = aggregation_from_conditions(rule.conditions)
    threshold = agg.get("threshold")
    if threshold is None:
        return None
    operator = str(agg.get("operator") or "gte")
    window = agg.get("window_seconds")
    window_i = int(window) if window is not None else None
    key = counter_key_for_rule(rule, ctx)
    fires = ctx.threshold_fires or {}
    fire = fires.get(key)
    if not fire:
        return None
    count = int(fire.get("count") or 0)
    if not compare_threshold(float(count), operator, float(threshold)):
        return None

    obj = class_he_plural(ctx.object_class)
    where = ""
    if rule.conditions.get("line_id"):
        where = f" את {_line_label(ctx, rule.conditions.get('line_id'))}"
    elif rule.conditions.get("zone_id"):
        where = f" לאזור {_zone_label(ctx, rule.conditions.get('zone_id'))}"
    window_he = ""
    if window_i:
        if window_i >= 3600 and window_i % 3600 == 0:
            window_he = f" במהלך {window_i // 3600} שעות"
        elif window_i >= 60 and window_i % 60 == 0:
            window_he = f" במהלך {window_i // 60} דקות"
        else:
            window_he = f" במהלך {window_i} שניות"
    message = f"{count} {obj} נכנסו{where}{window_he}".replace("נכנסו את", "חצו את")
    if rule.conditions.get("line_id"):
        message = f"{count} {obj} חצו את {_line_label(ctx, rule.conditions.get('line_id'))}{window_he}"
    elif rule.conditions.get("zone_id"):
        message = f"{count} {obj} נכנסו לאזור {_zone_label(ctx, rule.conditions.get('zone_id'))}{window_he}"

    return RuleMatch(
        rule_id=rule.id,
        rule_name=rule.name,
        zone_id=rule.conditions.get("zone_id"),
        line_id=rule.conditions.get("line_id"),
        duration_seconds=0.0,
        message_he=message,
        event_type="count_threshold",
        spatial_event="count_threshold",
        direction=rule.conditions.get("direction"),
        count=count,
        threshold=float(threshold),
        window_seconds=window_i,
        operator=operator,
        dedupe_key=f"{rule.id}:threshold:{key}:{count}:{ctx.timestamp.isoformat()}",
    )


def evaluate_rule(rule: RuleSnapshot, ctx: DetectionContext) -> RuleMatch | None:
    if not _base_gate(rule, ctx):
        return None
    trigger = infer_trigger(rule.conditions)
    if trigger == "zone_enter":
        return _match_zone_enter(rule, ctx)
    if trigger == "zone_exit":
        return _match_zone_exit(rule, ctx)
    if trigger == "dwell":
        return _match_dwell(rule, ctx)
    if trigger == "line_cross":
        return _match_line_cross(rule, ctx)
    if trigger == "count_threshold":
        return _match_count_threshold(rule, ctx)
    # zone_presence / default legacy
    return _match_zone_presence(rule, ctx)


def evaluate_rules(rules: list[RuleSnapshot], ctx: DetectionContext) -> list[RuleMatch]:
    matches: list[RuleMatch] = []
    for rule in rules:
        match = evaluate_rule(rule, ctx)
        if match is not None:
            matches.append(match)
    return matches


# Back-compat alias used by older imports
_class_he = class_he
