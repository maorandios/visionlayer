"""AI Test debug bundle, rejection reasons, and line-crossing semantics."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.domain.spatial.line_tracker import LineCrossingTracker
from app.domain.spatial.lines import crossing_direction, direction_matches, line_side
from app.domain.video_lab.debug_bundle import (
    REJECTION_REASON_HE,
    build_debug_bundle,
    build_funnel,
    rejection_he,
)
from app.domain.rules.tracker import ZonePresenceTracker


def _ts(sec: float) -> datetime:
    return datetime(2026, 10, 5, 12, 0, 0, tzinfo=UTC) + timedelta(seconds=sec)


def test_rejection_catalog_has_required_codes() -> None:
    required = {
        "object_class_mismatch",
        "track_not_confirmed",
        "zone_not_entered",
        "zone_not_exited",
        "not_inside_zone",
        "dwell_not_reached",
        "line_not_crossed",
        "direction_mismatch",
        "threshold_not_reached",
        "schedule_mismatch",
        "dedupe_blocked",
        "cooldown_active",
    }
    assert required <= set(REJECTION_REASON_HE)
    assert "המסלול לא חצה את הקו" in rejection_he("line_not_crossed")


def test_line_crossing_horizontal_vertical_diagonal() -> None:
    # Horizontal: y=0.5, a→b left to right; below→above = a_to_b
    assert crossing_direction(0.05, -0.05) == "a_to_b"
    assert crossing_direction(-0.05, 0.05) == "b_to_a"
    assert crossing_direction(0.05, 0.04) is None

    # Vertical line x=0.5 from (0.5,0.2) to (0.5,0.8)
    a, b = (0.5, 0.2), (0.5, 0.8)
    left = line_side((0.3, 0.5), a, b)
    right = line_side((0.7, 0.5), a, b)
    assert left * right < 0
    d = crossing_direction(left, right)
    assert d in {"a_to_b", "b_to_a"}

    # Diagonal
    a2, b2 = (0.2, 0.2), (0.8, 0.8)
    p1 = line_side((0.3, 0.6), a2, b2)
    p2 = line_side((0.6, 0.3), a2, b2)
    assert p1 * p2 < 0
    assert crossing_direction(p1, p2) in {"a_to_b", "b_to_a"}


def test_trajectory_line_cross_not_bbox_intersect() -> None:
    """Crossing requires previous_side != current_side via tracker, not bbox∩line."""
    lt = LineCrossingTracker(min_cross_interval_sec=0.05)
    points = [[0.2, 0.5], [0.8, 0.5]]
    # Stay on same side → no cross
    for y, t in [(0.8, 0.0), (0.75, 0.2), (0.7, 0.4)]:
        assert (
            lt.update(
                camera_id="cam",
                track_id=1,
                line_id="L",
                points=points,
                point=(0.5, y),
                at=_ts(t),
            )
            is None
        )
    # Flip side
    cross = lt.update(
        camera_id="cam",
        track_id=1,
        line_id="L",
        points=points,
        point=(0.5, 0.2),
        at=_ts(0.6),
    )
    assert cross is not None
    assert direction_matches(cross.direction, "a_to_b") or direction_matches(
        cross.direction, "any"
    )


def test_dwell_not_early() -> None:
    tracker = ZonePresenceTracker()
    reached = False
    for inside, t in [(False, 0), (True, 1), (True, 5), (True, 10), (True, 31)]:
        evs = tracker.update(
            camera_id="cam",
            track_id=9,
            zone_id="z",
            object_class="person",
            inside=inside,
            at=_ts(t),
            dwell_threshold_sec=30.0,
        )
        if any(e.kind == "dwell_threshold_reached" for e in evs):
            reached = True
            assert t >= 31
    assert reached


def test_zone_enter_exit_presence() -> None:
    tracker = ZonePresenceTracker()
    kinds: list[str] = []
    for inside, t in [(False, 0), (True, 1), (True, 2), (False, 3)]:
        kinds.extend(
            e.kind
            for e in tracker.update(
                camera_id="cam",
                track_id=1,
                zone_id="z",
                object_class="car",
                inside=inside,
                at=_ts(t),
            )
        )
    assert "zone_enter" in kinds
    assert "zone_exit" in kinds


def test_funnel_and_debug_bundle_same_run_shape() -> None:
    funnel = build_funnel(
        detections=[{}] * 10,
        tracks=[{"track_id": 1}, {"track_id": 2}],
        spatial_crossings=3,
        spatial_zone_enters=1,
        spatial_zone_exits=1,
        metric_contributions=2,
        rule_matches=1,
        events_created=1,
    )
    assert funnel["stages"][0]["count"] == 10
    assert funnel["stages"][-1]["count"] == 1

    asset = SimpleNamespace(id="a1", name_he="טסט", duration_sec=5.0, frame_count=50)
    rule = SimpleNamespace(
        id="r1",
        name="חוק",
        enabled=True,
        conditions_json={
            "object_classes": ["car"],
            "camera_id": "cam",
            "trigger": "line_cross",
            "line_id": "L1",
            "direction": "a_to_b",
        },
    )
    line = SimpleNamespace(
        id="L1",
        name="שער",
        enabled=True,
        points_json=[[0.2, 0.5], [0.8, 0.5]],
        label_a_to_b="כניסה",
        label_b_to_a="יציאה",
    )
    # Synthetic track crossing the line
    detections = []
    base = 1_700_000_000.0
    for i, y in enumerate([0.8, 0.7, 0.3, 0.2]):
        detections.append(
            {
                "class": "car",
                "confidence": 0.5,
                "bbox": [100, y * 100 - 20, 140, y * 100],
                "track_id": 17,
                "timestamp": base + i * 0.2,
                "frame_size": [200, 100],
                "camera_id": "cam",
            }
        )
    bundle = build_debug_bundle(
        run_id="run_1",
        camera_id="cam",
        asset=asset,
        rules=[rule],
        metric_defs=[],
        zones=[],
        lines=[line],
        detections=detections,
        overlays=[
            {
                "frame_index": 0,
                "timestamp_sec": 0.0,
                "boxes": [
                    {
                        "track_id": 17,
                        "class": "car",
                        "confidence": 0.5,
                        "bbox": [100, 60, 140, 80],
                    }
                ],
            }
        ],
        base_unix_ts=base,
        frame_stride=1,
        detection_threshold=0.25,
        frames_read=50,
        frames_analyzed=50,
        triggered_rule_ids=set(),
        event_rows=[],
        event_ids=[],
        hits=[],
        search_classes=["person", "car", "truck", "bus", "motorcycle", "bicycle"],
        correctness_mode=True,
        expected={"vehicle_entries": 1, "events": {"r1": 0}},
    )
    assert bundle["correctness_mode"] is True
    assert bundle["summary"]["stride"] == 1
    assert bundle["summary"]["detection_threshold"] == 0.25
    assert bundle["config"]["mode_he"] == "מצב בדיקת דיוק"
    assert bundle["overlays"][0]["boxes"][0]["anchor_px"]
    assert len(bundle["tracks"]) == 1
    assert bundle["tracks"][0]["track_id"] == 17
    assert bundle["expected_vs_actual"]
    assert any(r["rule_id"] == "r1" for r in bundle["rule_traces"])
