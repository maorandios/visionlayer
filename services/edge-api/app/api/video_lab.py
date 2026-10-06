"""Video Test Lab API — development only."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.db import get_db, get_session_factory
from app.adapters.models import Event
from app.api.event_broadcast import broadcast_event_created
from app.api.event_serializers import event_to_payload
from app.bus.event_bus import bus
from app.core.config import get_settings
from app.core.deps import CurrentUser, get_current_user
from app.core.errors import AppError, NotFoundError
from app.domain.pipeline.detection_pipeline import TOPIC_DETECTIONS
from app.domain.video_lab import service as video_lab

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/video-lab", tags=["video-lab"])


def _require_video_lab() -> None:
    settings = get_settings()
    if not settings.is_feature_enabled("video_lab"):
        raise AppError("מעבדת וידאו כבויה", code="feature_disabled", status_code=403)
    if settings.environment.lower() not in {"development", "dev", "local", "test"}:
        raise AppError("מעבדת וידאו זמינה רק במצב פיתוח", code="dev_only", status_code=403)


@router.get("/assets")
async def list_assets(
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    _require_video_lab()
    assets = await video_lab.list_assets(db)
    return [video_lab.asset_to_dict(a) for a in assets]


@router.post("/assets")
async def upload_asset(
    name_he: str = Form(...),
    location: str | None = Form(None),
    file: UploadFile = File(...),
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_video_lab()
    content = await file.read()
    asset = await video_lab.create_asset_from_upload(
        db,
        filename=file.filename or "video.mp4",
        content=content,
        name_he=name_he.strip() or "סרטון בדיקה",
        location=(location or "").strip() or None,
    )
    return video_lab.asset_to_dict(asset)


@router.get("/assets/{asset_id}")
async def get_asset(
    asset_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_video_lab()
    asset = await video_lab.get_asset(db, asset_id)
    return video_lab.asset_to_dict(asset)


@router.delete("/assets/{asset_id}")
async def delete_asset(
    asset_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    _require_video_lab()
    await video_lab.delete_asset(db, asset_id)
    return {"status": "deleted"}


@router.get("/assets/{asset_id}/video")
async def stream_video(
    asset_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    _require_video_lab()
    asset = await video_lab.get_asset(db, asset_id)
    path = Path(asset.stored_path)
    if not path.is_file():
        raise NotFoundError("קובץ הווידאו לא נמצא")
    return FileResponse(path, media_type="video/mp4", filename=asset.original_filename)


@router.get("/assets/{asset_id}/preview")
async def preview_frame(
    asset_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    _require_video_lab()
    asset = await video_lab.get_asset(db, asset_id)
    if not asset.preview_frame_path or not Path(asset.preview_frame_path).is_file():
        raise NotFoundError("תצוגה מקדימה לא נמצאה")
    return FileResponse(asset.preview_frame_path, media_type="image/jpeg")


async def _publish_factory(request: Request, db: AsyncSession):
    async def publish_and_collect(detections: list[dict[str, Any]]) -> list[str]:
        pipeline = getattr(request.app.state, "detection_pipeline", None)
        if pipeline is None:
            # Fallback: legacy bus per-detection (slow)
            ids: list[str] = []
            for detection in detections:
                request.app.state.last_batch_event_ids = []
                await bus.publish(TOPIC_DETECTIONS, detection)
                ids.extend(list(getattr(request.app.state, "last_batch_event_ids", []) or []))
        else:
            tracker = getattr(request.app.state, "zone_tracker", None)
            line_tracker = getattr(request.app.state, "line_tracker", None)
            if detections:
                cam = str(detections[0].get("camera_id"))
                if tracker is not None:
                    tracker.clear_camera(cam)
                if line_tracker is not None:
                    line_tracker.clear_camera(cam)
            ids = await pipeline.handle_batch(detections, once_per_track=True)

        if ids:
            for event_id in ids:
                row = await db.get(Event, event_id)
                if row is not None:
                    await broadcast_event_created(event_to_payload(row))
        return ids

    return publish_and_collect


def _clear_tracker_factory(request: Request):
    def clear_tracker(camera_id: str) -> None:
        tracker = getattr(request.app.state, "zone_tracker", None)
        if tracker is not None:
            tracker.clear_camera(camera_id)
        line_tracker = getattr(request.app.state, "line_tracker", None)
        if line_tracker is not None:
            line_tracker.clear_camera(camera_id)
        counters = getattr(request.app.state, "counters", None)
        if counters is not None:
            counters.clear()

    return clear_tracker


@router.post("/assets/{asset_id}/analyze")
async def analyze_asset(
    asset_id: str,
    request: Request,
    wait: bool = Query(
        default=False,
        description="If true, block until analysis completes (tests). UI should poll.",
    ),
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_video_lab()
    settings = get_settings()
    # Automated tests expect a completed job in one response.
    block = wait or settings.environment.lower() in {"test"}

    publish_and_collect = await _publish_factory(request, db)
    clear_tracker = _clear_tracker_factory(request)

    if block:
        job = await video_lab.run_analysis(
            db,
            asset_id=asset_id,
            publish_and_collect=publish_and_collect,
            clear_tracker=clear_tracker,
            prefer_onnx=True,
        )
        return video_lab.job_to_dict(job)

    job = await video_lab.create_running_job(db, asset_id=asset_id)
    job_id = job.id
    app = request.app

    async def _background() -> None:
        session_factory = get_session_factory()
        try:
            async with session_factory() as session:

                async def publish(detections: list[dict[str, Any]]) -> list[str]:
                    pipeline = getattr(app.state, "detection_pipeline", None)
                    if pipeline is None:
                        ids: list[str] = []
                        for detection in detections:
                            app.state.last_batch_event_ids = []
                            await bus.publish(TOPIC_DETECTIONS, detection)
                            ids.extend(list(getattr(app.state, "last_batch_event_ids", []) or []))
                    else:
                        if detections:
                            cam = str(detections[0].get("camera_id"))
                            tracker = getattr(app.state, "zone_tracker", None)
                            if tracker is not None:
                                tracker.clear_camera(cam)
                            line_tracker = getattr(app.state, "line_tracker", None)
                            if line_tracker is not None:
                                line_tracker.clear_camera(cam)
                        ids = await pipeline.handle_batch(detections, once_per_track=True)

                    if ids:
                        for event_id in ids:
                            row = await session.get(Event, event_id)
                            if row is not None:
                                await broadcast_event_created(event_to_payload(row))
                    return ids

                def clear(camera_id: str) -> None:
                    tracker = getattr(app.state, "zone_tracker", None)
                    if tracker is not None:
                        tracker.clear_camera(camera_id)
                    line_tracker = getattr(app.state, "line_tracker", None)
                    if line_tracker is not None:
                        line_tracker.clear_camera(camera_id)
                    counters = getattr(app.state, "counters", None)
                    if counters is not None:
                        counters.clear()

                running = await video_lab.get_job(session, job_id)
                await video_lab.run_analysis(
                    session,
                    asset_id=asset_id,
                    publish_and_collect=publish,
                    clear_tracker=clear,
                    prefer_onnx=True,
                    job=running,
                )
        except Exception:
            logger.exception("video_lab_background_failed job=%s", job_id)
            from app.domain.video_lab import analysis_lock

            analysis_lock.release(job_id)
            try:
                session_factory = get_session_factory()
                async with session_factory() as session:
                    failed = await video_lab.get_job(session, job_id)
                    if failed.status == "running":
                        failed.status = "failed"
                        failed.error_he = "הניתוח נכשל. נסו שוב או בדקו את קובץ הווידאו."
                        await session.commit()
            except Exception:
                logger.exception("video_lab_background_cleanup_failed job=%s", job_id)

    asyncio.create_task(_background())
    return video_lab.job_to_dict(job)


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_video_lab()
    job = await video_lab.get_job(db, job_id)
    payload = video_lab.job_to_dict(job)
    if job.status == "completed":
        from app.core.errors import NotFoundError as _NF
        from app.domain.video_lab import benchmark_store

        try:
            run = await benchmark_store.get_run(db, job.id)
            reviews = await benchmark_store.get_run_reviews(db, job.id)
            bench = benchmark_store.run_to_dict(run, reviews)
            payload["benchmark"] = bench
            payload["benchmark_run_id"] = run.id
            summary = dict(payload.get("summary") or {})
            summary["benchmark"] = bench
            summary["track_gallery"] = bench["track_gallery"]
            payload["summary"] = summary
        except _NF:
            pass
    return payload


@router.get("/jobs/{job_id}/frames/{image_key}")
async def get_job_frame(
    job_id: str,
    image_key: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    _require_video_lab()
    job = await video_lab.get_job(db, job_id)
    path = video_lab.best_frame_path(job.id, image_key)
    if not path.is_file():
        raise NotFoundError("פריים לא נמצא")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/jobs/{job_id}/tracks/{track_id}/image")
async def get_track_image(
    job_id: str,
    track_id: int,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    _require_video_lab()
    job = await video_lab.get_job(db, job_id)
    path = video_lab.track_image_path(job.id, track_id)
    if not path.is_file():
        raise NotFoundError("תמונת זיהוי לא נמצאה")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/assets/{asset_id}/jobs")
async def list_jobs(
    asset_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    _require_video_lab()
    await video_lab.get_asset(db, asset_id)
    jobs = await video_lab.list_jobs_for_asset(db, asset_id)
    return [video_lab.job_to_dict(j) for j in jobs]


@router.get("/assets/{asset_id}/runs")
async def list_benchmark_runs(
    asset_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    _require_video_lab()
    await video_lab.get_asset(db, asset_id)
    from app.domain.video_lab import benchmark_store

    runs = await benchmark_store.list_runs_for_asset(db, asset_id)
    return [benchmark_store.run_history_item(r) for r in runs]


@router.get("/runs/{run_id}")
async def get_benchmark_run(
    run_id: str,
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_video_lab()
    from app.domain.video_lab import benchmark_store

    run = await benchmark_store.get_run(db, run_id)
    reviews = await benchmark_store.get_run_reviews(db, run_id)
    return benchmark_store.run_to_dict(run, reviews)


@router.patch("/runs/{run_id}/tracks/{track_id}/review")
async def patch_track_review(
    run_id: str,
    track_id: int,
    body: dict[str, Any],
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _require_video_lab()
    from app.domain.video_lab import benchmark_store

    status = str(body.get("review_status") or "").strip()
    return await benchmark_store.set_track_review(
        db,
        run_id=run_id,
        track_id=track_id,
        review_status=status,
    )
