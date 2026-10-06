"""Seed demo cameras / zones / rules / events for local visual QA.

Runs only when VL_SEED_DEMO is enabled and the cameras table is empty.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.models import Camera, Event, Rule, Zone
from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Stable IDs so QA docs can reference them.
CAM_GATE = "demo-cam-gate"
CAM_WAREHOUSE = "demo-cam-warehouse"
CAM_PARKING = "demo-cam-parking"

ZONE_GATE = "demo-zone-gate"
ZONE_WAREHOUSE = "demo-zone-warehouse"
ZONE_LOADING = "demo-zone-loading"
ZONE_PARKING = "demo-zone-parking"

RULE_GATE = "demo-rule-gate-person"
RULE_WAREHOUSE = "demo-rule-warehouse-loiter"
RULE_PARKING = "demo-rule-parking-truck"

POLY_CENTER = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]
POLY_LEFT = [[0.05, 0.3], [0.45, 0.3], [0.45, 0.85], [0.05, 0.85]]
POLY_RIGHT = [[0.55, 0.25], [0.95, 0.25], [0.95, 0.9], [0.55, 0.9]]


async def ensure_demo_seed(session: AsyncSession) -> None:
    settings = get_settings()
    if not settings.should_seed_demo:
        return

    count = await session.scalar(select(func.count()).select_from(Camera))
    if count and count > 0:
        return

    now = datetime.now(UTC)

    session.add_all(
        [
            Camera(
                id=CAM_GATE,
                name="שער כניסה",
                location="חצר קדמית",
                enabled=True,
                status="online",
            ),
            Camera(
                id=CAM_WAREHOUSE,
                name="מחסן אחורי",
                location="מחסן",
                enabled=True,
                status="online",
            ),
            Camera(
                id=CAM_PARKING,
                name="חניון עובדים",
                location="חניון",
                enabled=True,
                status="unknown",
            ),
        ]
    )

    session.add_all(
        [
            Zone(
                id=ZONE_GATE,
                camera_id=CAM_GATE,
                name="אזור שער",
                kind="polygon",
                points_json=POLY_CENTER,
                enabled=True,
            ),
            Zone(
                id=ZONE_WAREHOUSE,
                camera_id=CAM_WAREHOUSE,
                name="מחסן אחורי",
                kind="polygon",
                points_json=POLY_CENTER,
                enabled=True,
            ),
            Zone(
                id=ZONE_LOADING,
                camera_id=CAM_WAREHOUSE,
                name="רמפת העמסה",
                kind="polygon",
                points_json=POLY_LEFT,
                enabled=True,
            ),
            Zone(
                id=ZONE_PARKING,
                camera_id=CAM_PARKING,
                name="נתיב חניון",
                kind="polygon",
                points_json=POLY_RIGHT,
                enabled=True,
            ),
        ]
    )

    all_day = {"from": "00:00", "to": "23:59"}
    night = {"from": "22:00", "to": "06:00"}

    session.add_all(
        [
            Rule(
                id=RULE_GATE,
                name="אדם באזור השער",
                enabled=True,
                conditions_json={
                    "object_classes": ["person"],
                    "camera_id": CAM_GATE,
                    "zone_id": ZONE_GATE,
                    "schedule": all_day,
                    "min_duration_seconds": 0,
                },
                actions_json=[{"type": "push_notification"}],
                cooldown_seconds=30,
            ),
            Rule(
                id=RULE_WAREHOUSE,
                name="שהייה במחסן בלילה",
                enabled=True,
                conditions_json={
                    "object_classes": ["person"],
                    "camera_id": CAM_WAREHOUSE,
                    "zone_id": ZONE_WAREHOUSE,
                    "schedule": night,
                    "min_duration_seconds": 30,
                },
                actions_json=[{"type": "push_notification"}],
                cooldown_seconds=60,
            ),
            Rule(
                id=RULE_PARKING,
                name="משאית בחניון",
                enabled=True,
                conditions_json={
                    "object_classes": ["truck"],
                    "camera_id": CAM_PARKING,
                    "zone_id": ZONE_PARKING,
                    "schedule": all_day,
                    "min_duration_seconds": 0,
                },
                actions_json=[{"type": "push_notification"}],
                cooldown_seconds=120,
            ),
        ]
    )

    history = [
        (
            CAM_GATE,
            ZONE_GATE,
            RULE_GATE,
            "person",
            "אדם זוהה באזור שער",
            "acknowledged",
            now - timedelta(hours=5),
        ),
        (
            CAM_GATE,
            ZONE_GATE,
            RULE_GATE,
            "person",
            "אדם זוהה באזור שער",
            "new",
            now - timedelta(hours=2),
        ),
        (
            CAM_WAREHOUSE,
            ZONE_WAREHOUSE,
            RULE_WAREHOUSE,
            "person",
            "אדם שהה באזור מחסן אחורי",
            "acknowledged",
            now - timedelta(days=1, hours=3),
        ),
        (
            CAM_PARKING,
            ZONE_PARKING,
            RULE_PARKING,
            "truck",
            "משאית זוהתה באזור נתיב חניון",
            "new",
            now - timedelta(hours=1),
        ),
        (
            CAM_WAREHOUSE,
            ZONE_LOADING,
            None,
            "person",
            "אדם זוהה באזור רמפת העמסה",
            "resolved",
            now - timedelta(days=2),
        ),
    ]

    for camera_id, zone_id, rule_id, obj, message, state, started in history:
        session.add(
            Event(
                id=str(uuid.uuid4()),
                camera_id=camera_id,
                rule_id=rule_id,
                type="zone_presence",
                severity="warning",
                object_class=obj,
                track_id=1,
                zone_id=zone_id,
                confidence=0.92,
                started_at=started,
                ended_at=started + timedelta(seconds=45) if state != "new" else None,
                state=state,
                message_he=message,
                payload_json={"source": "demo_seed", "duration_seconds": 45},
                created_at=started,
            )
        )

    await session.commit()
    logger.info("demo_seed_created cameras=3 zones=4 rules=3 events=%s", len(history))
