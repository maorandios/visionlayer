"""Unit tests for spatial events, line crossing, dwell, counters, and rule triggers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.domain.counters import CounterStore, compare_threshold
from app.domain.rules.engine import DetectionContext, RuleSnapshot, evaluate_rule, evaluate_rules
from app.domain.rules.tracker import ZonePresenceTracker
from app.domain.spatial import SpatialEvent
from app.domain.spatial.line_tracker import LineCrossingTracker
from app.domain.spatial.lines import crossing_direction, direction_matches, line_side


def _ts(sec: float) -> datetime:
    return datetime(2026, 10, 5, 12, 0, 0, tzinfo=UTC) + timedelta(seconds=sec)


def test_zone_enter_fires_once_on_outside_to_inside() -> None:
    tracker = ZonePresenceTracker()
    outs: list[str] = []
    for inside, t in [(False, 0), (True, 1), (True, 2), (True, 3)]:
        evs = tracker.update(
            camera_id="cam",
            track_id=1,
            zone_id="z1",
            object_class="person",
            inside=inside,
            at=_ts(t),
        )
        outs.extend(e.kind for e in evs)
    assert outs.count("zone_enter") == 1


def test_zone_reentry_two_enters() -> None:
    tracker = ZonePresenceTracker()
    enters = 0
    for inside, t in [(False, 0), (True, 1), (False, 2), (True, 3)]:
        evs = tracker.update(
            camera_id="cam",
            track_id=7,
            zone_id="warehouse",
            object_class="person",
            inside=inside,
            at=_ts(t),
        )
        enters += sum(1 for e in evs if e.kind == "zone_enter")
    assert enters == 2


def test_zone_exit_fires_once() -> None:
    tracker = ZonePresenceTracker()
    exits = 0
    for inside, t in [(True, 0), (True, 1), (False, 2), (False, 3)]:
        evs = tracker.update(
            camera_id="cam",
            track_id=2,
            zone_id="parking",
            object_class="car",
            inside=inside,
            at=_ts(t),
        )
        exits += sum(1 for e in evs if e.kind == "zone_exit")
    assert exits == 1


def test_line_crossing_a_to_b_once() -> None:
    # Horizontal line y=0.5 from (0.2,0.5) to (0.8,0.5)
    # side = (b-a)×(p-a); for left→right segment, y below line is positive.
    lt = LineCrossingTracker(min_cross_interval_sec=0.1)
    points = [[0.2, 0.5], [0.8, 0.5]]
    crosses = []
    # Move from below (positive) to above (negative) ⇒ a_to_b
    for y, t in [(0.8, 0.0), (0.7, 0.2), (0.3, 0.4), (0.2, 0.6)]:
        cross = lt.update(
            camera_id="cam",
            track_id=3,
            line_id="gate",
            points=points,
            point=(0.5, y),
            at=_ts(t),
        )
        if cross:
            crosses.append(cross.direction)
    assert crosses == ["a_to_b"]


def test_line_jitter_no_spam() -> None:
    lt = LineCrossingTracker(min_cross_interval_sec=0.5)
    points = [[0.0, 0.5], [1.0, 0.5]]
    # Oscillate near the line within hysteresis
    n = 0
    for i, y in enumerate([0.501, 0.499, 0.502, 0.498, 0.501]):
        cross = lt.update(
            camera_id="cam",
            track_id=9,
            line_id="gate",
            points=points,
            point=(0.5, y),
            at=_ts(i * 0.05),
        )
        if cross:
            n += 1
    assert n == 0


def test_direction_matches() -> None:
    assert direction_matches("a_to_b", "a_to_b")
    assert direction_matches("a_to_b", "any")
    assert not direction_matches("a_to_b", "b_to_a")
    assert crossing_direction(0.1, -0.1) == "a_to_b"
    assert crossing_direction(-0.1, 0.1) == "b_to_a"
    # point below horizontal line a→b (left-to-right) is positive side
    assert line_side((0.5, 0.8), (0.0, 0.5), (1.0, 0.5)) > 0


def test_dwell_fires_once_at_threshold() -> None:
    tracker = ZonePresenceTracker()
    dwells = []
    for t in range(12):
        evs = tracker.update(
            camera_id="cam",
            track_id=4,
            zone_id="entrance",
            object_class="person",
            inside=True,
            at=_ts(float(t)),
            dwell_threshold_sec=5.0,
        )
        dwells.extend(e for e in evs if e.kind == "dwell_threshold_reached")
    assert len(dwells) == 1
    assert dwells[0].duration_seconds >= 5.0


def test_dwell_resets_on_reentry() -> None:
    tracker = ZonePresenceTracker()
    dwells = 0
    # first stay 0-6 → fire at 5
    for t in range(7):
        evs = tracker.update(
            camera_id="cam",
            track_id=5,
            zone_id="z",
            object_class="person",
            inside=True,
            at=_ts(float(t)),
            dwell_threshold_sec=5.0,
        )
        dwells += sum(1 for e in evs if e.kind == "dwell_threshold_reached")
    # exit
    tracker.update(
        camera_id="cam",
        track_id=5,
        zone_id="z",
        object_class="person",
        inside=False,
        at=_ts(7),
        dwell_threshold_sec=5.0,
    )
    # re-enter and dwell again
    for t in range(8, 15):
        evs = tracker.update(
            camera_id="cam",
            track_id=5,
            zone_id="z",
            object_class="person",
            inside=True,
            at=_ts(float(t)),
            dwell_threshold_sec=5.0,
        )
        dwells += sum(1 for e in evs if e.kind == "dwell_threshold_reached")
    assert dwells == 2


def test_unique_object_counting() -> None:
    store = CounterStore()
    at = _ts(0)
    count = 0
    for tid in [1, 1, 1, 2, 2, 3, 3, 3, 4, 5]:
        count, _ = store.observe(
            key="k",
            track_id=tid,
            at=at,
            window_seconds=None,
            operator="gte",
            threshold=5,
        )
    assert count == 5


def test_threshold_edge_fires_once() -> None:
    store = CounterStore()
    fires = 0
    for tid in range(1, 7):
        _c, fire = store.observe(
            key="thr",
            track_id=tid,
            at=_ts(float(tid)),
            window_seconds=None,
            operator="gte",
            threshold=5,
        )
        if fire:
            fires += 1
    assert fires == 1
    assert compare_threshold(5, "gte", 5)
    assert compare_threshold(6, "gt", 5)
    assert not compare_threshold(4, "gte", 5)


def test_aggregation_window_expiry() -> None:
    store = CounterStore()
    for tid in range(1, 4):
        store.observe(
            key="win",
            track_id=tid,
            at=_ts(float(tid)),
            window_seconds=10,
            operator="gte",
            threshold=5,
        )
    # far later — old tracks expire
    count, _ = store.observe(
        key="win",
        track_id=99,
        at=_ts(100),
        window_seconds=10,
        operator="gte",
        threshold=5,
    )
    assert count == 1


def _rule(trigger: str, **cond) -> RuleSnapshot:
    conditions = {
        "object_classes": ["person"],
        "camera_id": "cam",
        "trigger": trigger,
        **cond,
    }
    return RuleSnapshot(
        id="r1",
        name="test",
        enabled=True,
        conditions=conditions,
        actions=[{"type": "create_event"}],
        cooldown_seconds=0,
    )


def _ctx(**kwargs) -> DetectionContext:
    base = {
        "camera_id": "cam",
        "object_class": "person",
        "track_id": 1,
        "confidence": 0.9,
        "timestamp": _ts(1),
        "active_zone_ids": frozenset(),
        "zone_durations": {},
        "camera_enabled": True,
        "enabled_zone_ids": frozenset({"z1"}),
        "zone_names": {"z1": "המחסן"},
        "line_names": {"gate": "שער הכניסה"},
        "spatial_events": (),
    }
    base.update(kwargs)
    return DetectionContext(**base)


def test_rule_zone_enter_hebrew() -> None:
    ev = SpatialEvent(
        kind="zone_enter",
        camera_id="cam",
        track_id=1,
        object_class="person",
        confidence=0.9,
        timestamp=_ts(1),
        zone_id="z1",
        occurrence_id="enter:1",
    )
    match = evaluate_rule(_rule("zone_enter", zone_id="z1"), _ctx(spatial_events=(ev,)))
    assert match is not None
    assert match.message_he == "אדם נכנס לאזור המחסן"
    assert match.spatial_event == "zone_enter"


def test_zone_enter_ignores_global_cooldown_for_sibling_tracks() -> None:
    """Regression: cooldown must not suppress other tracks' zone_enter events.

    Video Lab job vjob_2e79da4426d6 had enter_count=7 but only 1 event because the
    wizard default cooldown (30s) blocked every enter after the first.
    """
    rule = RuleSnapshot(
        id="r_enter",
        name="moto enter",
        enabled=True,
        conditions={
            "object_classes": ["motorcycle"],
            "camera_id": "cam",
            "zone_id": "z1",
            "trigger": "zone_enter",
        },
        actions=[{"type": "create_event"}],
        cooldown_seconds=30,
        last_triggered_at=_ts(1.0),
    )
    matches = []
    for tid, t in [(4, 1.0), (5, 1.7), (6, 2.2)]:
        ev = SpatialEvent(
            kind="zone_enter",
            camera_id="cam",
            track_id=tid,
            object_class="motorcycle",
            confidence=0.56,
            timestamp=_ts(t),
            zone_id="z1",
            occurrence_id=f"enter:cam:{tid}:z1:{_ts(t).isoformat()}",
        )
        m = evaluate_rule(
            rule,
            _ctx(
                object_class="motorcycle",
                track_id=tid,
                timestamp=_ts(t),
                spatial_events=(ev,),
            ),
        )
        if m is not None:
            matches.append(m)
            # Pipeline updates last_triggered after each fire — simulate that.
            rule = RuleSnapshot(
                id=rule.id,
                name=rule.name,
                enabled=rule.enabled,
                conditions=rule.conditions,
                actions=rule.actions,
                cooldown_seconds=rule.cooldown_seconds,
                last_triggered_at=_ts(t),
            )
    assert len(matches) == 3
    assert {m.dedupe_key for m in matches} == {
        f"r_enter:enter:cam:{tid}:z1:{_ts(t).isoformat()}" for tid, t in [(4, 1.0), (5, 1.7), (6, 2.2)]
    }


def test_rule_line_cross_direction() -> None:
    ev = SpatialEvent(
        kind="line_cross",
        camera_id="cam",
        track_id=1,
        object_class="truck",
        confidence=0.9,
        timestamp=_ts(1),
        line_id="gate",
        direction="a_to_b",
        occurrence_id="cross:1",
    )
    ctx = _ctx(object_class="truck", spatial_events=(ev,))
    rule_ok = _rule("line_cross", line_id="gate", direction="a_to_b", object_classes=["truck"])
    rule_bad = _rule("line_cross", line_id="gate", direction="b_to_a", object_classes=["truck"])
    assert evaluate_rule(rule_ok, ctx) is not None
    assert evaluate_rule(rule_bad, ctx) is None


def test_rule_count_threshold_once() -> None:
    rule = _rule(
        "count_threshold",
        zone_id="z1",
        threshold=5,
        operator="gte",
        aggregation_window_seconds=600,
    )
    key = "cnt|r1|cam|z1||person|any"
    fire_ctx = _ctx(
        threshold_fires={
            key: {"count": 5, "threshold": 5, "operator": "gte", "window_seconds": 600}
        }
    )
    match = evaluate_rule(rule, fire_ctx)
    assert match is not None
    assert match.count == 5
    # no fire payload → no match
    assert evaluate_rule(rule, _ctx()) is None


def test_dedupe_keys_differ_for_reentry() -> None:
    rule = _rule("zone_enter", zone_id="z1")
    e1 = SpatialEvent(
        kind="zone_enter",
        camera_id="cam",
        track_id=1,
        object_class="person",
        confidence=0.9,
        timestamp=_ts(1),
        zone_id="z1",
        occurrence_id="enter:a",
    )
    e2 = SpatialEvent(
        kind="zone_enter",
        camera_id="cam",
        track_id=1,
        object_class="person",
        confidence=0.9,
        timestamp=_ts(10),
        zone_id="z1",
        occurrence_id="enter:b",
    )
    m1 = evaluate_rule(rule, _ctx(spatial_events=(e1,)))
    m2 = evaluate_rule(rule, _ctx(timestamp=_ts(10), spatial_events=(e2,)))
    assert m1 and m2
    assert m1.dedupe_key != m2.dedupe_key


def test_legacy_presence_still_works() -> None:
    rule = RuleSnapshot(
        id="legacy",
        name="presence",
        enabled=True,
        conditions={
            "object_classes": ["person"],
            "camera_id": "cam",
            "zone_id": "z1",
            "min_duration_seconds": 30,
        },
        actions=[{"type": "create_event"}],
        cooldown_seconds=0,
    )
    match = evaluate_rule(
        rule,
        _ctx(
            active_zone_ids=frozenset({"z1"}),
            zone_durations={"z1": 35.0},
        ),
    )
    assert match is not None
    assert match.spatial_event == "zone_presence"


def test_evaluate_rules_no_duplicate_spam_same_frame() -> None:
    ev = SpatialEvent(
        kind="zone_enter",
        camera_id="cam",
        track_id=1,
        object_class="person",
        confidence=0.9,
        timestamp=_ts(1),
        zone_id="z1",
        occurrence_id="enter:1",
    )
    rule = _rule("zone_enter", zone_id="z1")
    matches = evaluate_rules([rule, rule], _ctx(spatial_events=(ev,)))
    # two identical rule snapshots → two matches at engine level; pipeline dedupes by key
    assert len(matches) == 2
    assert matches[0].dedupe_key == matches[1].dedupe_key
