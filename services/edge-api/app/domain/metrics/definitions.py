"""MetricDefinition validation, naming, and engine-query mapping."""

from __future__ import annotations

from typing import Any

from app.domain.vision_capabilities import (
    ENGINE_METRIC_TYPE,
    METRIC_REQUIREMENTS,
    is_supported_metric_type,
    is_supported_object_type,
    resolve_object_classes,
)

OBJECT_LABEL_HE: dict[str, str] = {
    "person": "אנשים",
    "vehicle": "רכבים",
    "car": "מכוניות",
    "truck": "משאיות",
    "bus": "אוטובוסים",
    "motorcycle": "אופנועים",
    "bicycle": "אופניים",
}

OBJECT_LABEL_HE_SINGULAR: dict[str, str] = {
    "person": "אדם",
    "vehicle": "רכב",
    "car": "מכונית",
    "truck": "משאית",
    "bus": "אוטובוס",
    "motorcycle": "אופנוע",
    "bicycle": "אופניים",
}

METRIC_LABEL_HE: dict[str, str] = {
    "entries": "כניסות",
    "exits": "יציאות",
    "line_crossings": "חציות קו",
    "occupancy_current": "כמות כרגע",
    "occupancy_peak": "תפוסת שיא",
    "dwell_avg": "זמן שהייה ממוצע",
    "dwell_max": "זמן שהייה מקסימלי",
    "objects_observed": "אובייקטים שנצפו",
}


def validate_definition_payload(
    *,
    metric_type: str,
    object_type: str,
    scope_type: str,
    zone_id: str | None,
    line_id: str | None,
    direction: str | None,
) -> list[str]:
    """Return Hebrew validation errors (empty = valid)."""
    errors: list[str] = []
    if not is_supported_metric_type(metric_type):
        errors.append("סוג מדד לא נתמך")
        return errors
    if not is_supported_object_type(object_type):
        errors.append("סוג אובייקט לא נתמך")
        return errors

    req = METRIC_REQUIREMENTS[metric_type]
    spatial = req["spatial"]
    dir_req = req["direction"]

    if spatial == "line":
        if not line_id:
            errors.append("נדרש קו למדד זה")
        if scope_type != "line":
            errors.append("ההיקף חייב להיות קו")
        if zone_id:
            errors.append("אסור לציין אזור למדד מבוסס קו")
    elif spatial == "zone":
        if not zone_id:
            errors.append("נדרש אזור למדד זה")
        if scope_type != "zone":
            errors.append("ההיקף חייב להיות אזור")
        if line_id:
            errors.append("אסור לציין קו למדד מבוסס אזור")
    elif spatial == "optional_zone":
        if scope_type == "zone":
            if not zone_id:
                errors.append("נדרש אזור כאשר ההיקף הוא אזור")
        elif scope_type == "camera":
            if zone_id or line_id:
                errors.append("שדה ראייה מלא לא יכול לכלול אזור או קו")
        else:
            errors.append("ההיקף חייב להיות מצלמה או אזור")

    if dir_req is True:
        if direction not in {"a_to_b", "b_to_a"}:
            errors.append("נדרש כיוון למדד זה")
    elif dir_req == "optional":
        if direction is not None and direction not in {"any", "a_to_b", "b_to_a"}:
            errors.append("כיוון לא תקין")
    else:
        if direction not in (None, "any"):
            errors.append("מדד זה אינו תומך בכיוון")

    return errors


def suggest_metric_name(
    *,
    metric_type: str,
    object_type: str,
    place_name: str | None = None,
    direction_label: str | None = None,
) -> str:
    obj = OBJECT_LABEL_HE.get(object_type, object_type)
    obj_s = OBJECT_LABEL_HE_SINGULAR.get(object_type, object_type)
    place = (place_name or "").strip()

    if metric_type == "entries":
        return f"כניסות {obj}" if not place else f"כניסות {obj} ב{place}"
    if metric_type == "exits":
        return f"יציאות {obj}" if not place else f"יציאות {obj} מ{place}"
    if metric_type == "line_crossings":
        if place and direction_label:
            return f"{obj} שחצו את {place} ({direction_label})"
        if place:
            return f"{obj} שחצו את {place}"
        return f"חציות קו — {obj}"
    if metric_type == "occupancy_current":
        return f"תפוסת {obj_s}" if not place else f"תפוסת {obj} ב{place}"
    if metric_type == "occupancy_peak":
        return f"שיא תפוסת {obj}" if not place else f"שיא תפוסת {obj} ב{place}"
    if metric_type == "dwell_avg":
        return f"זמן שהייה ממוצע" if not place else f"זמן שהייה ממוצע ב{place}"
    if metric_type == "dwell_max":
        return f"זמן שהייה מקסימלי" if not place else f"זמן שהייה מקסימלי ב{place}"
    if metric_type == "objects_observed":
        if place:
            return f"{obj} שנצפו ב{place}"
        return f"{obj} שנצפו במצלמה"
    return METRIC_LABEL_HE.get(metric_type, metric_type)


def engine_query_hint(metric_type: str) -> dict[str, Any]:
    """How Activity / queries should read values for this definition type."""
    return {
        "engine_metric_type": ENGINE_METRIC_TYPE.get(metric_type),
        "value_field": {
            "entries": "sum",
            "exits": "sum",
            "line_crossings": "sum",
            "occupancy_current": "occupancy_current",
            "occupancy_peak": "occupancy_peak",
            "dwell_avg": "dwell_avg",
            "dwell_max": "dwell_max",
            "objects_observed": "sum",
        }.get(metric_type, "sum"),
    }


def build_object_classes(object_type: str) -> list[str]:
    return resolve_object_classes(object_type)
