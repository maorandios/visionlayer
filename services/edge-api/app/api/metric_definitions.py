"""Metric Definition CRUD — what each camera continuously measures (not Events)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.adapters.models import Camera, Line, MetricDefinition, Zone
from app.api.metric_definition_schemas import (
    MetricDefinitionCreate,
    MetricDefinitionResponse,
    MetricDefinitionUpdate,
)
from app.core.deps import CurrentUser, get_current_user
from app.core.errors import NotFoundError, ValidationAppError
from app.core.ids import new_id
from app.domain.metrics.definitions import (
    build_object_classes,
    engine_query_hint,
    suggest_metric_name,
    validate_definition_payload,
)

router = APIRouter(tags=["metric-definitions"])


def _to_response(row: MetricDefinition) -> MetricDefinitionResponse:
    hint = engine_query_hint(row.metric_type)
    return MetricDefinitionResponse(
        id=row.id,
        camera_id=row.camera_id,
        name=row.name,
        metric_type=row.metric_type,
        object_type=row.object_type,
        object_classes=list(row.object_classes_json or []),
        scope_type=row.scope_type,
        zone_id=row.zone_id,
        line_id=row.line_id,
        direction=row.direction,
        enabled=row.enabled,
        created_at=row.created_at,
        updated_at=row.updated_at,
        engine_metric_type=hint.get("engine_metric_type"),
        value_field=hint.get("value_field"),
    )


async def _place_names(
    db: AsyncSession, *, zone_id: str | None, line_id: str | None
) -> tuple[str | None, str | None, str | None]:
    zone_name = line_name = label = None
    if zone_id:
        z = await db.get(Zone, zone_id)
        zone_name = z.name if z else None
    if line_id:
        ln = await db.get(Line, line_id)
        if ln:
            line_name = ln.name
            label = ln.label_a_to_b or ln.label_b_to_a
    return zone_name, line_name, label


async def _assert_spatial(
    db: AsyncSession,
    camera_id: str,
    *,
    zone_id: str | None,
    line_id: str | None,
) -> None:
    if zone_id:
        z = await db.get(Zone, zone_id)
        if z is None or z.camera_id != camera_id:
            raise ValidationAppError("האזור לא שייך למצלמה זו")
    if line_id:
        ln = await db.get(Line, line_id)
        if ln is None or ln.camera_id != camera_id:
            raise ValidationAppError("הקו לא שייך למצלמה זו")


def _normalize_scope(
    metric_type: str,
    scope_type: str,
    zone_id: str | None,
    line_id: str | None,
) -> tuple[str, str | None, str | None, str | None]:
    """Derive consistent scope + clear unused spatial ids."""
    from app.domain.vision_capabilities import METRIC_REQUIREMENTS

    req = METRIC_REQUIREMENTS[metric_type]
    spatial = req["spatial"]
    direction_default = None
    if spatial == "line":
        return "line", None, line_id, direction_default
    if spatial == "zone":
        return "zone", zone_id, None, None
    # optional_zone
    if scope_type == "zone" or zone_id:
        return "zone", zone_id, None, None
    return "camera", None, None, None


@router.get("/api/v1/cameras/{camera_id}/metrics", response_model=list[MetricDefinitionResponse])
async def list_camera_metrics(
    camera_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MetricDefinitionResponse]:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")
    result = await db.execute(
        select(MetricDefinition)
        .where(MetricDefinition.camera_id == camera_id)
        .order_by(MetricDefinition.created_at.asc())
    )
    return [_to_response(r) for r in result.scalars().all()]


@router.post(
    "/api/v1/cameras/{camera_id}/metrics",
    response_model=MetricDefinitionResponse,
    status_code=201,
)
async def create_camera_metric(
    camera_id: str,
    body: MetricDefinitionCreate,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MetricDefinitionResponse:
    camera = await db.get(Camera, camera_id)
    if camera is None:
        raise NotFoundError("מצלמה לא נמצאה")

    scope_type, zone_id, line_id, _ = _normalize_scope(
        body.metric_type, body.scope_type, body.zone_id, body.line_id
    )
    direction = body.direction
    if body.metric_type in {"entries", "exits"} and direction in (None, "any"):
        direction = "a_to_b" if body.metric_type == "entries" else "b_to_a"
    if body.metric_type == "line_crossings" and direction is None:
        direction = "any"

    errors = validate_definition_payload(
        metric_type=body.metric_type,
        object_type=body.object_type,
        scope_type=scope_type,
        zone_id=zone_id,
        line_id=line_id,
        direction=direction,
    )
    if errors:
        raise ValidationAppError("; ".join(errors))

    await _assert_spatial(db, camera_id, zone_id=zone_id, line_id=line_id)

    zone_name, line_name, _side = await _place_names(db, zone_id=zone_id, line_id=line_id)
    place = zone_name or line_name
    dir_label = None
    if line_id and direction in {"a_to_b", "b_to_a"}:
        ln = await db.get(Line, line_id)
        if ln:
            dir_label = ln.label_a_to_b if direction == "a_to_b" else ln.label_b_to_a

    name = (body.name or "").strip() or suggest_metric_name(
        metric_type=body.metric_type,
        object_type=body.object_type,
        place_name=place,
        direction_label=dir_label,
    )

    mid = body.id or new_id("mdef")
    if await db.get(MetricDefinition, mid) is not None:
        mid = new_id("mdef")

    row = MetricDefinition(
        id=mid,
        camera_id=camera_id,
        name=name,
        metric_type=body.metric_type,
        object_type=body.object_type,
        object_classes_json=build_object_classes(body.object_type),
        scope_type=scope_type,
        zone_id=zone_id,
        line_id=line_id,
        direction=direction,
        enabled=body.enabled,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.get("/api/v1/metric-definitions/{metric_id}", response_model=MetricDefinitionResponse)
async def get_metric_definition(
    metric_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MetricDefinitionResponse:
    row = await db.get(MetricDefinition, metric_id)
    if row is None:
        raise NotFoundError("מדד לא נמצא")
    return _to_response(row)


@router.patch("/api/v1/metric-definitions/{metric_id}", response_model=MetricDefinitionResponse)
async def update_metric_definition(
    metric_id: str,
    body: MetricDefinitionUpdate,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MetricDefinitionResponse:
    row = await db.get(MetricDefinition, metric_id)
    if row is None:
        raise NotFoundError("מדד לא נמצא")

    metric_type = body.metric_type or row.metric_type
    object_type = body.object_type or row.object_type
    scope_type = body.scope_type or row.scope_type
    zone_id = row.zone_id if not body.clear_zone else None
    line_id = row.line_id if not body.clear_line else None
    if body.zone_id is not None:
        zone_id = body.zone_id
    if body.line_id is not None:
        line_id = body.line_id
    direction = body.direction if body.direction is not None else row.direction

    scope_type, zone_id, line_id, _ = _normalize_scope(metric_type, scope_type, zone_id, line_id)

    errors = validate_definition_payload(
        metric_type=metric_type,
        object_type=object_type,
        scope_type=scope_type,
        zone_id=zone_id,
        line_id=line_id,
        direction=direction,
    )
    if errors:
        raise ValidationAppError("; ".join(errors))

    await _assert_spatial(db, row.camera_id, zone_id=zone_id, line_id=line_id)

    if body.name is not None:
        row.name = body.name.strip()
    row.metric_type = metric_type
    row.object_type = object_type
    row.object_classes_json = build_object_classes(object_type)
    row.scope_type = scope_type
    row.zone_id = zone_id
    row.line_id = line_id
    row.direction = direction
    if body.enabled is not None:
        row.enabled = body.enabled
    row.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.delete("/api/v1/metric-definitions/{metric_id}", status_code=204)
async def delete_metric_definition(
    metric_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await db.get(MetricDefinition, metric_id)
    if row is None:
        raise NotFoundError("מדד לא נמצא")
    await db.delete(row)
    await db.commit()
