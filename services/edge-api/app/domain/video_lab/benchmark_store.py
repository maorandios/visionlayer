"""Persist and query Video Lab Benchmark Runs."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.models import (
    VideoAnalysisRun,
    VideoAnalysisTrackReview,
    VideoLabAsset,
    VideoLabJob,
)
from app.core.errors import NotFoundError, ValidationAppError
from app.domain.video_lab.benchmark import (
    VALID_REVIEW_STATUSES,
    events_breakdown,
    false_positive_stats,
    model_display_name,
    processing_fps,
)


def _reviews_map(rows: list[VideoAnalysisTrackReview]) -> dict[int, str]:
    return {int(r.track_id): str(r.review_status) for r in rows}


def compute_fp_for_run(
    run: VideoAnalysisRun,
    review_rows: list[VideoAnalysisTrackReview],
) -> dict[str, Any]:
    gallery = list(run.track_gallery_json or [])
    status_by_tid = _reviews_map(review_rows)
    # Every gallery track counts; missing row ⇒ unreviewed
    statuses: list[dict[str, Any]] = []
    for card in gallery:
        tid = int(card["track_id"])
        statuses.append({"review_status": status_by_tid.get(tid, "unreviewed")})
    # Include orphan review rows not in gallery
    gallery_ids = {int(c["track_id"]) for c in gallery}
    for tid, st in status_by_tid.items():
        if tid not in gallery_ids:
            statuses.append({"review_status": st})
    return false_positive_stats(statuses)


def enrich_gallery_with_reviews(
    gallery: list[dict[str, Any]],
    review_rows: list[VideoAnalysisTrackReview],
) -> list[dict[str, Any]]:
    status_by_tid = _reviews_map(review_rows)
    out: list[dict[str, Any]] = []
    for card in gallery:
        tid = int(card["track_id"])
        out.append({**card, "review_status": status_by_tid.get(tid, "unreviewed")})
    return out


def run_to_dict(
    run: VideoAnalysisRun,
    review_rows: list[VideoAnalysisTrackReview] | None = None,
) -> dict[str, Any]:
    review_rows = review_rows or []
    fp = compute_fp_for_run(run, review_rows)
    gallery = enrich_gallery_with_reviews(list(run.track_gallery_json or []), review_rows)
    return {
        "id": run.id,
        "job_id": run.job_id,
        "asset_id": run.asset_id,
        "camera_id": run.camera_id,
        "status": run.status,
        "analyzed_at": run.analyzed_at.isoformat() if run.analyzed_at else None,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "config": {
            "detector_model": run.detector_model,
            "detector_model_display": model_display_name(
                run.detector_model if str(run.detector_model).endswith(".onnx") else None,
                run.detector_model,
            ),
            "tracker": run.tracker_name,
            "frame_stride": run.frame_stride,
            "detector_confidence": run.detector_confidence_json,
            "video_duration_sec": run.video_duration_sec,
            "source_video_fps": run.source_video_fps,
            "resolution": {
                "width": run.video_width,
                "height": run.video_height,
            },
            **(run.config_json or {}),
        },
        "metrics": {
            "detections_total": run.detections_total,
            "detections_by_class": run.detections_by_class_json,
            "unique_tracks_total": run.unique_tracks_total,
            "unique_tracks_by_class": run.unique_tracks_by_class_json,
            "events_total": run.events_total,
            "events_by_rule": run.events_by_rule_json,
            "events_by_type": run.events_by_type_json,
            "analysis_time_seconds": run.analysis_time_seconds,
            "processing_fps": run.processing_fps,
            "video_frames_total": run.video_frames_total,
            "detector_frames_analyzed": run.detector_frames_analyzed,
            "detector_calls": run.detector_calls,
            "false_positives": fp,
        },
        "event_ids": list(run.event_ids_json or []),
        "track_gallery": gallery,
    }


def run_history_item(run: VideoAnalysisRun) -> dict[str, Any]:
    return {
        "id": run.id,
        "job_id": run.job_id,
        "analyzed_at": run.analyzed_at.isoformat() if run.analyzed_at else None,
        "detector_model": run.detector_model,
        "detector_model_display": model_display_name(
            run.detector_model if ".onnx" in str(run.detector_model) else None,
            run.detector_model,
        ),
        "frame_stride": run.frame_stride,
        "analysis_time_seconds": run.analysis_time_seconds,
        "unique_tracks_total": run.unique_tracks_total,
        "events_total": run.events_total,
        "detections_total": run.detections_total,
        "processing_fps": run.processing_fps,
    }


async def create_run_from_job(
    session: AsyncSession,
    *,
    job: VideoLabJob,
    asset: VideoLabAsset,
    event_rows: list[Any],
    track_gallery: list[dict[str, Any]],
    analysis_time_seconds: float,
    detector_model: str,
    tracker_name: str,
    frame_stride: int,
    detector_confidence: dict[str, Any],
    detections_total: int,
    detections_by_class: dict[str, int],
    unique_tracks_total: int,
    unique_tracks_by_class: dict[str, int],
    video_frames_total: int,
    detector_frames_analyzed: int,
    detector_calls: int,
    config_extra: dict[str, Any] | None = None,
) -> VideoAnalysisRun:
    by_rule, by_type = events_breakdown(event_rows)
    wall = max(0.0, float(analysis_time_seconds))
    fps = processing_fps(video_frames_total=int(video_frames_total), analysis_time_seconds=wall)
    run = VideoAnalysisRun(
        id=job.id,  # stable: one Benchmark Run per job, never overwritten in place for re-runs
        job_id=job.id,
        asset_id=asset.id,
        camera_id=asset.camera_id,
        status="completed",
        detector_model=detector_model,
        tracker_name=tracker_name,
        frame_stride=int(frame_stride),
        detector_confidence_json=dict(detector_confidence or {}),
        video_duration_sec=float(asset.duration_sec or 0),
        source_video_fps=float(asset.fps or 0),
        video_width=int(asset.width or 0),
        video_height=int(asset.height or 0),
        video_frames_total=int(video_frames_total),
        detector_frames_analyzed=int(detector_frames_analyzed),
        detector_calls=int(detector_calls),
        detections_total=int(detections_total),
        detections_by_class_json=dict(detections_by_class or {}),
        unique_tracks_total=int(unique_tracks_total),
        unique_tracks_by_class_json=dict(unique_tracks_by_class or {}),
        events_total=len(event_rows),
        events_by_rule_json=by_rule,
        events_by_type_json=by_type,
        event_ids_json=[getattr(e, "id", None) or e.get("id") for e in event_rows],
        analysis_time_seconds=round(wall, 3),
        processing_fps=round(fps, 3),
        config_json=dict(config_extra or {}),
        track_gallery_json=list(track_gallery or []),
        analyzed_at=datetime.now(UTC),
    )
    session.add(run)
    # Seed unreviewed rows for every track (optional — compute treats missing as unreviewed)
    for card in track_gallery or []:
        session.add(
            VideoAnalysisTrackReview(
                run_id=run.id,
                track_id=int(card["track_id"]),
                review_status="unreviewed",
            )
        )
    await session.flush()
    return run


async def get_run(session: AsyncSession, run_id: str) -> VideoAnalysisRun:
    run = await session.get(VideoAnalysisRun, run_id)
    if run is None:
        raise NotFoundError("רצת בנצ׳מרק לא נמצאה")
    return run


async def get_run_reviews(session: AsyncSession, run_id: str) -> list[VideoAnalysisTrackReview]:
    result = await session.execute(
        select(VideoAnalysisTrackReview).where(VideoAnalysisTrackReview.run_id == run_id)
    )
    return list(result.scalars().all())


async def list_runs_for_asset(session: AsyncSession, asset_id: str) -> list[VideoAnalysisRun]:
    result = await session.execute(
        select(VideoAnalysisRun)
        .where(VideoAnalysisRun.asset_id == asset_id)
        .order_by(VideoAnalysisRun.analyzed_at.desc())
    )
    return list(result.scalars().all())


async def latest_successful_run_for_camera(
    session: AsyncSession, camera_id: str
) -> VideoAnalysisRun | None:
    """Latest completed Benchmark Run for a camera (user-facing Activity/Events scope)."""
    result = await session.execute(
        select(VideoAnalysisRun)
        .where(
            VideoAnalysisRun.camera_id == camera_id,
            VideoAnalysisRun.status == "completed",
        )
        .order_by(VideoAnalysisRun.analyzed_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def set_track_review(
    session: AsyncSession,
    *,
    run_id: str,
    track_id: int,
    review_status: str,
) -> dict[str, Any]:
    if review_status not in VALID_REVIEW_STATUSES:
        raise ValidationAppError("סטטוס בדיקה לא תקין")
    run = await get_run(session, run_id)
    gallery_ids = {int(c["track_id"]) for c in (run.track_gallery_json or [])}
    if int(track_id) not in gallery_ids:
        raise NotFoundError("מסלול לא נמצא ברצה זו")

    row = await session.get(VideoAnalysisTrackReview, (run_id, int(track_id)))
    if row is None:
        row = VideoAnalysisTrackReview(
            run_id=run_id,
            track_id=int(track_id),
            review_status=review_status,
        )
        session.add(row)
    else:
        row.review_status = review_status
        row.updated_at = datetime.now(UTC)
    await session.commit()
    reviews = await get_run_reviews(session, run_id)
    return run_to_dict(run, reviews)
