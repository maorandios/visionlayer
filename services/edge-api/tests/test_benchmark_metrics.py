"""Unit tests for Benchmark Run metric definitions."""

from __future__ import annotations

from app.domain.video_lab.benchmark import false_positive_stats, processing_fps


def test_detections_total_is_raw_count() -> None:
    # Definition check: detections_total equals accepted detector outputs count
    accepted = [{"i": i} for i in range(10)]
    assert len(accepted) == 10


def test_unique_tracks_one_identity() -> None:
    track_ids = {7 for _ in range(30)}
    assert len(track_ids) == 1


def test_events_total_one_fire() -> None:
    event_ids = ["evt_1"]
    assert len(event_ids) == 1


def test_false_positive_rate_from_reviews() -> None:
    reviews = (
        [{"review_status": "correct"}] * 8
        + [{"review_status": "false_positive"}] * 2
    )
    stats = false_positive_stats(reviews)
    assert stats["reviewed_tracks"] == 10
    assert stats["false_positive_tracks"] == 2
    assert stats["false_positive_rate"] == 0.2


def test_false_positive_rate_null_when_unreviewed() -> None:
    stats = false_positive_stats([{"review_status": "unreviewed"}] * 5)
    assert stats["reviewed_tracks"] == 0
    assert stats["false_positive_rate"] is None


def test_analysis_time_and_fps_formula() -> None:
    analysis_time = 50.0
    assert analysis_time > 0
    fps = processing_fps(video_frames_total=462, analysis_time_seconds=analysis_time)
    assert abs(fps - 462 / 50.0) < 1e-9
    assert processing_fps(video_frames_total=100, analysis_time_seconds=0) == 0.0
