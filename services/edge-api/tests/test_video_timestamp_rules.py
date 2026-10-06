"""Duration rules driven by video timestamps (not wall clock)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.domain.rules.engine import DetectionContext, RuleSnapshot, evaluate_rule
from app.domain.rules.tracker import ZonePresenceTracker


def test_duration_uses_timestamp_delta_not_wall_clock() -> None:
    tracker = ZonePresenceTracker()
    t0 = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
    t5 = datetime(2024, 1, 1, 12, 0, 5, tzinfo=UTC)

    tracker.update(
        camera_id="c1",
        track_id=1,
        zone_id="z1",
        object_class="person",
        inside=True,
        at=t0,
    )
    tracker.update(
        camera_id="c1",
        track_id=1,
        zone_id="z1",
        object_class="person",
        inside=True,
        at=t5,
    )
    duration = tracker.duration_seconds(camera_id="c1", track_id=1, zone_id="z1", at=t5)
    assert duration == 5.0

    rule = RuleSnapshot(
        id="r1",
        name="שהייה",
        enabled=True,
        conditions={
            "object_classes": ["person"],
            "camera_id": "c1",
            "zone_id": "z1",
            "schedule": {"from": "00:00", "to": "23:59"},
            "min_duration_seconds": 5,
        },
        actions=[{"type": "push_notification"}],
        cooldown_seconds=0,
    )
    ctx = DetectionContext(
        camera_id="c1",
        object_class="person",
        track_id=1,
        confidence=0.9,
        timestamp=t5,
        active_zone_ids=frozenset({"z1"}),
        zone_durations={"z1": duration},
        camera_enabled=True,
        enabled_zone_ids=frozenset({"z1"}),
    )
    match = evaluate_rule(rule, ctx)
    assert match is not None
    assert match.duration_seconds == 5.0
