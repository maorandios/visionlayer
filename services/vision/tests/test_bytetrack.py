"""ByteTrack adapter unit tests — identity stability, occlusion, class separation."""

from __future__ import annotations

from detectors.base import RawDetection
from trackers.bytetrack_adapter import ByteTrackAdapter
from trackers.config import TrackerConfig
from trackers.iou_tracker import IoUTracker


def _det(cls: str, x1: float, y1: float, x2: float, y2: float, conf: float = 0.9) -> RawDetection:
    return RawDetection(cls, conf, (x1, y1, x2, y2))


def test_stable_identity_moving_object() -> None:
    tracker = ByteTrackAdapter(frame_rate=10.0)
    tracker.reset()
    ids: list[int] = []
    for i in range(12):
        x = 10 + i * 5
        out = tracker.update([_det("person", x, 20, x + 40, 120)], frame_size=(320, 240), timestamp=i / 10)
        assert len(out) == 1
        ids.append(out[0].track_id)
    assert len(set(ids)) == 1


def test_two_independent_persons_keep_distinct_ids() -> None:
    tracker = ByteTrackAdapter(frame_rate=10.0)
    tracker.reset()
    left_ids: list[int] = []
    right_ids: list[int] = []
    for i in range(10):
        out = tracker.update(
            [
                _det("person", 10 + i, 20, 50 + i, 120),
                _det("person", 200 - i, 20, 240 - i, 120),
            ],
            frame_size=(320, 240),
            timestamp=i / 10,
        )
        assert len(out) == 2
        ordered = sorted(out, key=lambda t: t.bbox[0])
        left_ids.append(ordered[0].track_id)
        right_ids.append(ordered[1].track_id)
    assert len(set(left_ids)) == 1
    assert len(set(right_ids)) == 1
    assert left_ids[0] != right_ids[0]


def test_temporary_occlusion_recovers_same_id() -> None:
    cfg = TrackerConfig(lost_track_buffer=30, track_activation_threshold=0.4)
    tracker = ByteTrackAdapter(config=cfg, frame_rate=30.0)
    tracker.reset()
    first = tracker.update([_det("person", 100, 40, 160, 180)], frame_size=(320, 240), timestamp=0.0)
    tid = first[0].track_id
    # missing for a few frames (within buffer)
    for i in range(1, 6):
        tracker.update([], frame_size=(320, 240), timestamp=i / 30)
    recovered = tracker.update(
        [_det("person", 105, 42, 165, 182, conf=0.85)],
        frame_size=(320, 240),
        timestamp=6 / 30,
    )
    assert len(recovered) == 1
    assert recovered[0].track_id == tid


def test_class_separation_person_and_car() -> None:
    tracker = ByteTrackAdapter(frame_rate=10.0)
    tracker.reset()
    for i in range(8):
        out = tracker.update(
            [
                _det("person", 40 + i, 30, 90 + i, 150),
                _det("car", 45 + i, 40, 140 + i, 120),  # overlapping region
            ],
            frame_size=(320, 240),
            timestamp=i / 10,
        )
        classes = {t.class_name for t in out}
        assert "person" in classes and "car" in classes
        by_cls = {t.class_name: t.track_id for t in out}
        assert by_cls["person"] != by_cls["car"]


def test_track_expiration_beyond_buffer() -> None:
    cfg = TrackerConfig(lost_track_buffer=5, track_activation_threshold=0.4)
    # buffer_size = int(10/30 * 5) = 1 → expire quickly; use higher fps for clearer buffer
    tracker = ByteTrackAdapter(config=cfg, frame_rate=30.0)
    tracker.reset()
    first = tracker.update([_det("bicycle", 80, 80, 140, 160)], frame_size=(320, 240), timestamp=0.0)
    old_id = first[0].track_id
    # disappear longer than max_time_lost (= buffer_size = int(30/30*5)=5)
    for i in range(1, 12):
        tracker.update([], frame_size=(320, 240), timestamp=i / 30)
    again = tracker.update(
        [_det("bicycle", 82, 80, 142, 160)],
        frame_size=(320, 240),
        timestamp=12 / 30,
    )
    assert len(again) == 1
    assert again[0].track_id != old_id


def test_bytetrack_diagnostics_present() -> None:
    tracker = ByteTrackAdapter(frame_rate=10.0)
    tracker.reset()
    tracker.update([_det("person", 10, 10, 50, 80)], frame_size=(100, 100), timestamp=0.0)
    diag = tracker.diagnostics()
    assert diag["implementation"] == "bytetrack"
    assert diag["unique_tracks"] >= 1
    assert "config" in diag
    assert diag["frame_rate"] == 10.0


def test_iou_fallback_still_works() -> None:
    tracker = IoUTracker()
    tracker.reset()
    a = tracker.update([_det("person", 10, 10, 40, 70)])
    b = tracker.update([_det("person", 12, 10, 42, 70)])
    assert a[0].track_id == b[0].track_id
    assert tracker.name == "iou"
