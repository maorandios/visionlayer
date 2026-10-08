"""Compile user-facing Metric/Rule definitions into unambiguous runtime ExecutionPlans.

Runtime evaluation should depend on these plans (and stored conditions), not on
ambiguous UI wording. Vehicle group resolution is centralized here.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Iterable

from app.domain.rules.engine import infer_trigger
from app.domain.vision_capabilities import (
    OBJECT_TYPE_TO_CLASSES,
    VEHICLE_CLASSES,
    resolve_object_classes,
)

# VisionLayer-supported detector classes (debug mode searches all of these).
VISIONLAYER_PRIMARY_CLASSES: tuple[str, ...] = (
    "person",
    "car",
    "truck",
    "bus",
    "motorcycle",
    "bicycle",
)

# POC intended semantics for Rule actions (may differ from legacy stored triggers).
# Current wizard still stores zone_enter/zone_exit for "נכנס לאזור"/"יצא מאזור".
# Metrics entries/exits already compile to line crossings.
POC_RULE_ACTION_SEMANTICS: dict[str, dict[str, Any]] = {
    "detected": {
        "runtime": "confirmed_track_exists",
        "trigger": "zone_presence",
        "spatial_mode": "camera",
        "tracking_required": True,
        "he": "זוהה במצלמה — מסלול מאושר קיים",
    },
    "enter": {
        "runtime": "line_cross_inward",
        "trigger": "line_cross",
        "spatial_mode": "line",
        "tracking_required": True,
        "he": "נכנס — חציית קו בכיוון כניסה",
    },
    "exit": {
        "runtime": "line_cross_outward",
        "trigger": "line_cross",
        "spatial_mode": "line",
        "tracking_required": True,
        "he": "יצא — חציית קו בכיוון יציאה",
    },
    "line_cross": {
        "runtime": "line_cross",
        "trigger": "line_cross",
        "spatial_mode": "line",
        "tracking_required": True,
        "he": "חצה קו — מסלול חוצה את הקו",
    },
    "zone_presence": {
        "runtime": "anchor_inside_zone",
        "trigger": "zone_presence",
        "spatial_mode": "zone",
        "tracking_required": True,
        "he": "נמצא באזור — עוגן מרחבי בתוך הפוליגון",
    },
    "dwell": {
        "runtime": "dwell_in_zone",
        "trigger": "dwell",
        "spatial_mode": "zone",
        "tracking_required": True,
        "he": "נשאר באזור — שהייה רציפה למשך שהוגדר",
    },
    "count_threshold": {
        "runtime": "count_threshold",
        "trigger": "count_threshold",
        "spatial_mode": "aggregation",
        "tracking_required": True,
        "he": "הכמות עברה סף — לפי אגרגציה מוגדרת",
    },
    # Legacy wizard ids still in product:
    "zone_enter": {
        "runtime": "zone_enter",
        "trigger": "zone_enter",
        "spatial_mode": "zone",
        "tracking_required": True,
        "he": "נכנס לאזור (legacy) — מעבר מחוץ→פנים באזור",
        "poc_note": "POC intended generic 'נכנס' is line_cross inward; current UI uses zone_enter",
    },
    "zone_exit": {
        "runtime": "zone_exit",
        "trigger": "zone_exit",
        "spatial_mode": "zone",
        "tracking_required": True,
        "he": "יצא מאזור (legacy) — מעבר פנים→חוץ באזור",
        "poc_note": "POC intended generic 'יצא' is line_cross outward; current UI uses zone_exit",
    },
}

POC_METRIC_SEMANTICS: dict[str, dict[str, Any]] = {
    "entries": {
        "spatial_mode": "line",
        "engine": "line_crossings",
        "he": "חציית קו בכיוון כניסה (inward)",
    },
    "exits": {
        "spatial_mode": "line",
        "engine": "line_crossings",
        "he": "חציית קו בכיוון יציאה (outward)",
    },
    "line_crossings": {
        "spatial_mode": "line",
        "engine": "line_crossings",
        "he": "מסלול חוצה קו (כיוון אופציונלי)",
    },
    "occupancy_current": {
        "spatial_mode": "zone",
        "engine": "occupancy",
        "he": "מספר מסלולים מאושרים עם עוגן בתוך האזור",
    },
    "occupancy_peak": {
        "spatial_mode": "zone",
        "engine": "occupancy_peak",
        "he": "מקסימום תפוסה נוכחית לאורך הריצה",
    },
    "dwell_avg": {
        "spatial_mode": "zone",
        "engine": "dwell",
        "he": "ממוצע משכי שהייה שהושלמו (יציאה / סוף וידאו)",
    },
    "dwell_max": {
        "spatial_mode": "zone",
        "engine": "dwell",
        "he": "מקסימום משך שהייה במהלך הריצה",
    },
    "objects_observed": {
        "spatial_mode": "optional_zone",
        "engine": "unique_objects",
        "he": "מספר מסלולים מאושרים (לא זיהויים גולמיים)",
    },
}


def resolve_classes_for_object_type(object_type: str) -> list[str]:
    """Central vehicle/person/class group resolution."""
    return resolve_object_classes(object_type)


def expand_object_classes(classes: Iterable[str]) -> list[str]:
    """Expand logical groups (e.g. vehicle) and dedupe detector class names."""
    out: set[str] = set()
    for raw in classes:
        name = str(raw).strip()
        if not name:
            continue
        if name in OBJECT_TYPE_TO_CLASSES:
            out.update(OBJECT_TYPE_TO_CLASSES[name])
        else:
            out.add(name)
    return sorted(out)


def vehicle_group_resolution() -> dict[str, Any]:
    return {
        "group": "vehicle",
        "resolved_classes": sorted(VEHICLE_CLASSES),
        "note_he": "חוק/מדד מסוג רכב מתאים ל־car/truck/bus/motorcycle",
    }


@dataclass
class RuleExecutionPlan:
    rule_id: str
    rule_name: str
    camera_id: str | None
    object_classes: list[str]
    object_type_resolved_from: str | None
    trigger_type: str
    spatial_mode: str
    zone_id: str | None = None
    line_id: str | None = None
    direction: str | None = None
    dwell_seconds: float | None = None
    threshold: float | None = None
    aggregation_window_seconds: float | None = None
    schedule: dict[str, Any] | None = None
    dedupe_mode: str = "once_per_track"
    cooldown_seconds: int = 0
    tracking_required: bool = True
    enabled: bool = True
    semantics_he: str = ""
    poc_note: str | None = None
    raw_conditions: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MetricExecutionPlan:
    metric_definition_id: str
    metric_name: str
    camera_id: str
    object_classes: list[str]
    object_type: str | None
    metric_type: str
    spatial_mode: str
    zone_id: str | None = None
    line_id: str | None = None
    direction: str | None = None
    aggregation_mode: str = "sum"
    tracking_required: bool = True
    enabled: bool = True
    semantics_he: str = ""
    engine_metric_type: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _infer_object_type(classes: list[str]) -> str | None:
    sorted_c = frozenset(classes)
    if sorted_c == VEHICLE_CLASSES:
        return "vehicle"
    if sorted_c == frozenset({"person"}):
        return "person"
    if len(sorted_c) == 1:
        only = next(iter(sorted_c))
        if only in OBJECT_TYPE_TO_CLASSES:
            return only
    return None


def _spatial_mode_for_trigger(trigger: str, conditions: dict[str, Any]) -> str:
    if trigger == "line_cross" or conditions.get("line_id"):
        return "line"
    if trigger in {"zone_enter", "zone_exit", "zone_presence", "dwell"} or conditions.get("zone_id"):
        return "zone"
    if trigger == "count_threshold":
        if conditions.get("line_id"):
            return "line"
        if conditions.get("zone_id"):
            return "zone"
        return "aggregation"
    return "camera"


def compile_rule_execution_plan(rule: Any) -> RuleExecutionPlan:
    conditions = dict(getattr(rule, "conditions_json", None) or getattr(rule, "conditions", None) or {})
    trigger = infer_trigger(conditions)
    classes = expand_object_classes(conditions.get("object_classes") or [])
    sem = POC_RULE_ACTION_SEMANTICS.get(trigger, {})
    agg = conditions.get("aggregation") if isinstance(conditions.get("aggregation"), dict) else {}
    threshold = conditions.get("threshold")
    if threshold is None:
        threshold = conditions.get("count")
    window = conditions.get("aggregation_window_seconds")
    if window is None and agg:
        window = agg.get("window_seconds")
    dwell = conditions.get("min_duration_seconds")
    if trigger == "dwell" and dwell is None:
        dwell = 0
    cooldown = int(getattr(rule, "cooldown_seconds", 0) or 0)
    dedupe = "cooldown" if cooldown > 0 and trigger not in {"zone_enter", "zone_exit", "line_cross"} else "once_per_track"
    return RuleExecutionPlan(
        rule_id=str(getattr(rule, "id")),
        rule_name=str(getattr(rule, "name", "") or ""),
        camera_id=conditions.get("camera_id"),
        object_classes=classes,
        object_type_resolved_from=_infer_object_type(classes),
        trigger_type=trigger,
        spatial_mode=_spatial_mode_for_trigger(trigger, conditions),
        zone_id=conditions.get("zone_id"),
        line_id=conditions.get("line_id"),
        direction=conditions.get("direction"),
        dwell_seconds=float(dwell) if dwell is not None else None,
        threshold=float(threshold) if threshold is not None else None,
        aggregation_window_seconds=float(window) if window is not None else None,
        schedule=conditions.get("schedule") if isinstance(conditions.get("schedule"), dict) else None,
        dedupe_mode=dedupe,
        cooldown_seconds=cooldown,
        tracking_required=True,
        enabled=bool(getattr(rule, "enabled", True)),
        semantics_he=str(sem.get("he") or trigger),
        poc_note=sem.get("poc_note"),
        raw_conditions=conditions,
    )


def compile_metric_execution_plan(metric_def: Any) -> MetricExecutionPlan:
    metric_type = str(getattr(metric_def, "metric_type", "") or "")
    object_type = getattr(metric_def, "object_type", None)
    classes_raw = list(getattr(metric_def, "object_classes_json", None) or [])
    if object_type:
        try:
            classes = resolve_classes_for_object_type(str(object_type))
        except ValueError:
            classes = expand_object_classes(classes_raw)
    else:
        classes = expand_object_classes(classes_raw)
    sem = POC_METRIC_SEMANTICS.get(metric_type, {})
    spatial = str(sem.get("spatial_mode") or "camera")
    scope = getattr(metric_def, "scope_type", None) or getattr(metric_def, "spatial_scope", None)
    zone_id = getattr(metric_def, "zone_id", None)
    line_id = getattr(metric_def, "line_id", None)
    direction = getattr(metric_def, "direction", None)
    agg = "sum"
    if metric_type in {"occupancy_current", "occupancy_peak"}:
        agg = "occupancy"
    elif metric_type in {"dwell_avg", "dwell_max"}:
        agg = "dwell"
    return MetricExecutionPlan(
        metric_definition_id=str(getattr(metric_def, "id")),
        metric_name=str(getattr(metric_def, "name", "") or getattr(metric_def, "name_he", "") or ""),
        camera_id=str(getattr(metric_def, "camera_id", "") or ""),
        object_classes=classes,
        object_type=str(object_type) if object_type else _infer_object_type(classes),
        metric_type=metric_type,
        spatial_mode=spatial if not scope else str(scope),
        zone_id=zone_id,
        line_id=line_id,
        direction=direction,
        aggregation_mode=agg,
        tracking_required=True,
        enabled=bool(getattr(metric_def, "enabled", True)),
        semantics_he=str(sem.get("he") or metric_type),
        engine_metric_type=sem.get("engine"),
    )


def compile_camera_execution_plans(
    *,
    camera_id: str,
    rules: Iterable[Any],
    metric_defs: Iterable[Any],
) -> dict[str, Any]:
    rule_plans = []
    for rule in rules:
        plan = compile_rule_execution_plan(rule)
        if plan.camera_id and plan.camera_id != camera_id:
            continue
        rule_plans.append(plan.to_dict())
    metric_plans = []
    for md in metric_defs:
        if getattr(md, "camera_id", None) != camera_id:
            continue
        metric_plans.append(compile_metric_execution_plan(md).to_dict())
    return {
        "camera_id": camera_id,
        "vehicle_group": vehicle_group_resolution(),
        "rules": rule_plans,
        "metrics": metric_plans,
        "poc_rule_semantics": POC_RULE_ACTION_SEMANTICS,
        "poc_metric_semantics": POC_METRIC_SEMANTICS,
    }
