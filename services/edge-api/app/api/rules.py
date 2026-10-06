"""Rule CRUD and validation endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db
from app.adapters.models import Camera, Rule, Zone
from app.api.schemas import (
    RuleCreate,
    RuleResponse,
    RuleUpdate,
    RuleValidateRequest,
    RuleValidateResponse,
)
from app.core.deps import CurrentUser, get_current_user
from app.core.errors import NotFoundError
from app.core.ids import new_id, slugify

router = APIRouter(prefix="/api/v1/rules", tags=["rules"])


def _conditions_dict(body_conditions: Any) -> dict[str, Any]:
    data = body_conditions.model_dump(by_alias=True, exclude_none=True)
    return data


def _to_response(rule: Rule) -> RuleResponse:
    return RuleResponse(
        id=rule.id,
        name=rule.name,
        enabled=rule.enabled,
        conditions=dict(rule.conditions_json or {}),
        actions=list(rule.actions_json or []),
        cooldown_seconds=rule.cooldown_seconds,
        last_triggered_at=rule.last_triggered_at,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


async def _validate_references(
    db: AsyncSession, conditions: dict[str, Any]
) -> list[str]:
    errors: list[str] = []
    camera_id = conditions.get("camera_id")
    zone_id = conditions.get("zone_id")
    if camera_id and await db.get(Camera, camera_id) is None:
        errors.append(f"מצלמה לא נמצאה: {camera_id}")
    if zone_id:
        zone = await db.get(Zone, zone_id)
        if zone is None:
            errors.append(f"אזור לא נמצא: {zone_id}")
        elif camera_id and zone.camera_id != camera_id:
            errors.append("האזור אינו שייך למצלמה שצוינה בחוק")
    if not conditions.get("object_classes"):
        errors.append("חובה לציין לפחות מחלקת אובייקט אחת")
    if not zone_id:
        errors.append("חובה לציין zone_id בשלב זה")
    return errors


@router.get("", response_model=list[RuleResponse])
async def list_rules(
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RuleResponse]:
    result = await db.execute(select(Rule).order_by(Rule.created_at.desc()))
    return [_to_response(r) for r in result.scalars().all()]


@router.post("/validate", response_model=RuleValidateResponse)
async def validate_rule(
    body: RuleValidateRequest,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RuleValidateResponse:
    conditions = _conditions_dict(body.conditions)
    errors = await _validate_references(db, conditions)
    return RuleValidateResponse(valid=len(errors) == 0, errors=errors)


@router.post("", response_model=RuleResponse, status_code=201)
async def create_rule(
    body: RuleCreate,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RuleResponse:
    conditions = _conditions_dict(body.conditions)
    errors = await _validate_references(db, conditions)
    if errors:
        from app.core.errors import ValidationAppError

        raise ValidationAppError("חוק לא תקין", details={"errors": errors})

    rule_id = body.id or f"rule_{slugify(body.name)}"
    if await db.get(Rule, rule_id) is not None:
        rule_id = new_id("rule")

    now = datetime.now(UTC)
    rule = Rule(
        id=rule_id,
        name=body.name,
        enabled=body.enabled,
        conditions_json=conditions,
        actions_json=[a.model_dump() for a in body.actions],
        cooldown_seconds=body.cooldown_seconds,
        created_at=now,
        updated_at=now,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _to_response(rule)


@router.get("/{rule_id}", response_model=RuleResponse)
async def get_rule(
    rule_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RuleResponse:
    rule = await db.get(Rule, rule_id)
    if rule is None:
        raise NotFoundError("חוק לא נמצא")
    return _to_response(rule)


@router.patch("/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: str,
    body: RuleUpdate,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RuleResponse:
    rule = await db.get(Rule, rule_id)
    if rule is None:
        raise NotFoundError("חוק לא נמצא")
    if body.name is not None:
        rule.name = body.name
    if body.enabled is not None:
        rule.enabled = body.enabled
    if body.conditions is not None:
        conditions = _conditions_dict(body.conditions)
        errors = await _validate_references(db, conditions)
        if errors:
            from app.core.errors import ValidationAppError

            raise ValidationAppError("חוק לא תקין", details={"errors": errors})
        rule.conditions_json = conditions
    if body.actions is not None:
        rule.actions_json = [a.model_dump() for a in body.actions]
    if body.cooldown_seconds is not None:
        rule.cooldown_seconds = body.cooldown_seconds
    rule.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(rule)
    return _to_response(rule)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    rule = await db.get(Rule, rule_id)
    if rule is None:
        raise NotFoundError("חוק לא נמצא")
    await db.delete(rule)
    await db.commit()


@router.post("/{rule_id}/duplicate", response_model=RuleResponse, status_code=201)
async def duplicate_rule(
    rule_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RuleResponse:
    rule = await db.get(Rule, rule_id)
    if rule is None:
        raise NotFoundError("חוק לא נמצא")
    now = datetime.now(UTC)
    clone = Rule(
        id=new_id("rule"),
        name=f"{rule.name} (עותק)",
        enabled=False,
        conditions_json=dict(rule.conditions_json or {}),
        actions_json=list(rule.actions_json or []),
        cooldown_seconds=rule.cooldown_seconds,
        created_at=now,
        updated_at=now,
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)
    return _to_response(clone)
