"""Video Test Lab orchestration — Product Layer boundary to vision lab_api."""

from __future__ import annotations

import asyncio
import logging
import sys
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import cv2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.models import Camera, Event, Rule, VideoLabAsset, VideoLabJob, Zone
from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError, ValidationAppError
from app.domain.video_lab import analysis_lock
from app.domain.video_lab import benchmark_store
from app.domain.video_lab.benchmark import false_positive_stats, model_display_name, processing_fps
from app.domain.video_lab.diagnostics import (
    build_focus_timeline,
    build_hits_from_events,
    class_he,
    diagnose_rules,
    first_seen_by_class,
)
from app.domain.video_lab.progress import clear_progress, get_progress, set_progress
from app.domain.video_lab.snapshots import build_best_frame_cards, build_track_result_images

logger = logging.getLogger(__name__)

PublishFn = Callable[[list[dict[str, Any]]], Awaitable[list[str]]]
ClearTrackerFn = Callable[[str], None]

BUSY_HE = "ניתוח אחר כבר רץ. המתינו לסיומו לפני הפעלת ניתוח נוסף."

# Detector confidence snapshot for Benchmark Run config (mirrors yolox_onnx defaults)
_DETECTOR_CONFIDENCE = {
    "conf_threshold": 0.40,
    "nms_threshold": 0.45,
    "score_threshold": 0.40,
    "class_floors": {
        "person": 0.40,
        "bicycle": 0.45,
        "motorcycle": 0.50,
        "car": 0.40,
        "bus": 0.40,
        "truck": 0.40,
    },
}

def _repo_paths() -> tuple[Path, Path, Path, Path, Path]:
    """Return (vision_root, videos_dir, frames_dir, models_dir, results_dir)."""
    edge_api = Path(__file__).resolve().parents[3]
    services = edge_api.parent
    repo = services.parent
    vision_root = services / "vision"
    data = repo / "data"
    videos = data / "test-videos"
    frames = data / "test-frames"
    models = data / "models"
    results = data / "test-results"
    for d in (videos, frames, models, results):
        d.mkdir(parents=True, exist_ok=True)
    settings = get_settings()
    if settings.database_url.startswith("sqlite"):
        Path(settings.database_url.split("///")[-1]).parent.mkdir(parents=True, exist_ok=True)
    return vision_root, videos, frames, models, results


def _ensure_vision_path() -> Path:
    vision_root, *_ = _repo_paths()
    if str(vision_root) not in sys.path:
        sys.path.insert(0, str(vision_root))
    return vision_root


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _extract_preview(video_path: Path, out_path: Path) -> None:
    cap = cv2.VideoCapture(str(video_path))
    try:
        ok, frame = cap.read()
        if not ok or frame is None:
            raise ValidationAppError("לא הצלחנו לחלץ תמונת תצוגה מהסרטון")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(out_path), frame)
    finally:
        cap.release()


async def create_asset_from_upload(
    session: AsyncSession,
    *,
    filename: str,
    content: bytes,
    name_he: str,
    location: str | None,
) -> VideoLabAsset:
    _ensure_vision_path()
    from lab_api import VideoValidationError, probe_video, validate_upload

    try:
        validate_upload(filename=filename, size_bytes=len(content))
    except VideoValidationError as exc:
        raise ValidationAppError(exc.message_he) from exc

    _, videos_dir, frames_dir, _, _ = _repo_paths()
    asset_id = _new_id("vlab")
    camera_id = _new_id("vcam")
    ext = Path(filename).suffix.lower() or ".mp4"
    stored = videos_dir / f"{asset_id}{ext}"
    stored.write_bytes(content)

    try:
        meta = probe_video(stored)
    except VideoValidationError as exc:
        stored.unlink(missing_ok=True)
        raise ValidationAppError(exc.message_he) from exc
    except Exception as exc:
        stored.unlink(missing_ok=True)
        logger.exception("video_probe_failed")
        raise ValidationAppError("לא הצלחנו לקרוא את קובץ הווידאו") from exc

    preview = frames_dir / f"{asset_id}_preview.jpg"
    try:
        _extract_preview(stored, preview)
    except ValidationAppError:
        stored.unlink(missing_ok=True)
        raise

    now = datetime.now(UTC)
    camera = Camera(
        id=camera_id,
        name=name_he,
        location=location,
        enabled=True,
        status="online",
        snapshot_path=str(preview),
        created_at=now,
        updated_at=now,
    )
    asset = VideoLabAsset(
        id=asset_id,
        camera_id=camera_id,
        name_he=name_he,
        location=location,
        original_filename=filename,
        stored_path=str(stored),
        preview_frame_path=str(preview),
        duration_sec=meta.duration_sec,
        width=meta.width,
        height=meta.height,
        fps=meta.fps,
        codec=meta.codec,
        frame_count=meta.frame_count,
    )
    session.add(camera)
    session.add(asset)
    await session.commit()
    await session.refresh(asset)
    return asset


async def list_assets(session: AsyncSession) -> list[VideoLabAsset]:
    result = await session.execute(select(VideoLabAsset).order_by(VideoLabAsset.created_at.desc()))
    return list(result.scalars().all())


async def get_asset(session: AsyncSession, asset_id: str) -> VideoLabAsset:
    asset = await session.get(VideoLabAsset, asset_id)
    if asset is None:
        raise NotFoundError("סרטון לא נמצא")
    return asset


async def get_job(session: AsyncSession, job_id: str) -> VideoLabJob:
    job = await session.get(VideoLabJob, job_id)
    if job is None:
        raise NotFoundError("משימת ניתוח לא נמצאה")
    return job


async def list_jobs_for_asset(session: AsyncSession, asset_id: str) -> list[VideoLabJob]:
    result = await session.execute(
        select(VideoLabJob)
        .where(VideoLabJob.asset_id == asset_id)
        .order_by(VideoLabJob.created_at.desc())
    )
    return list(result.scalars().all())


async def delete_asset(session: AsyncSession, asset_id: str) -> None:
    asset = await get_asset(session, asset_id)
    camera = await session.get(Camera, asset.camera_id)
    for path in (asset.stored_path, asset.preview_frame_path):
        if path:
            Path(path).unlink(missing_ok=True)
    if camera is not None:
        await session.delete(camera)
    else:
        await session.delete(asset)
    await session.commit()


async def create_running_job(session: AsyncSession, *, asset_id: str) -> VideoLabJob:
    """Create a job row. Acquires the single-analysis lock (caller must release on failure)."""
    asset = await get_asset(session, asset_id)
    job_id = _new_id("vjob")
    if not analysis_lock.try_acquire(job_id):
        active = analysis_lock.active_job_id()
        raise ValidationAppError(
            f"{BUSY_HE}" + (f" (משימה פעילה: {active})" if active else "")
        )
    job = VideoLabJob(
        id=job_id,
        asset_id=asset.id,
        status="running",
        metrics_json={
            "progress": {
                "percent": 0,
                "frames_done": 0,
                "frames_total": int(asset.frame_count or 0),
                "phase_he": "בתור…",
            }
        },
        summary_json={},
        overlays_json=[],
        timeline_json=[],
        event_ids_json=[],
        started_at=datetime.now(UTC),
    )
    try:
        session.add(job)
        await session.commit()
        await session.refresh(job)
    except Exception:
        analysis_lock.release(job_id)
        raise
    set_progress(
        job.id,
        percent=0,
        frames_done=0,
        frames_total=int(asset.frame_count or 0),
        phase_he="בתור…",
    )
    return job


def _target_classes_for_camera(rules: list[Any], camera_id: str) -> list[str]:
    """Collect enabled rule object classes scoped to this virtual camera."""
    found: set[str] = set()
    for rule in rules:
        if not rule.enabled:
            continue
        conditions = dict(rule.conditions_json or {})
        rule_camera = conditions.get("camera_id")
        if rule_camera and rule_camera != camera_id:
            continue
        for cls in conditions.get("object_classes") or []:
            name = str(cls).strip()
            if name:
                found.add(name)
    return sorted(found)


async def run_analysis(
    session: AsyncSession,
    *,
    asset_id: str,
    publish_and_collect: PublishFn,
    clear_tracker: ClearTrackerFn,
    prefer_onnx: bool = True,
    job: VideoLabJob | None = None,
) -> VideoLabJob:
    """Run analysis for an asset. Creates a job unless one is provided."""
    asset = await get_asset(session, asset_id)
    owns_lock = False
    if job is None:
        job = await create_running_job(session, asset_id=asset_id)
        owns_lock = True
    else:
        # ensure we have a managed instance; background path already holds the lock
        job = await session.get(VideoLabJob, job.id) or job
        if analysis_lock.active_job_id() != job.id:
            if not analysis_lock.try_acquire(job.id):
                raise ValidationAppError(BUSY_HE)
            owns_lock = True
        else:
            owns_lock = True

    _ensure_vision_path()
    from lab_api import get_vision_runtime_config, resolve_model_order, run_video_lab_analysis

    clear_tracker(asset.camera_id)
    event_ids: list[str] = []
    rules_triggered: set[str] = set()
    # Full-pipeline wall clock (detect → track → rules → events → gallery)
    import time as _time

    pipeline_t0 = _time.perf_counter()

    try:
        rules_result = await session.execute(select(Rule))
        all_rules = list(rules_result.scalars().all())
        target_classes = _target_classes_for_camera(all_rules, asset.camera_id)
        if not target_classes:
            raise ValidationAppError(
                "אין חוק פעיל למצלמה זו. צרו חוק עם סוג האובייקט לחיפוש לפני הרצת ניתוח AI."
            )

        _, _, frames_dir, models, results_dir = _repo_paths()
        runtime = get_vision_runtime_config()
        model_path = None
        for name in resolve_model_order():
            candidate = models / name
            if candidate.is_file():
                model_path = candidate
                break
        settings = get_settings()
        force_scripted = settings.environment.lower() in {"test"}
        use_onnx = prefer_onnx and model_path is not None and not force_scripted

        job_id = job.id
        targets_he = ", ".join(class_he(c) for c in target_classes)

        def _on_progress(done: int, total: int, phase_he: str) -> None:
            total = max(1, int(total))
            pct = 100.0 * min(done, total) / total
            label = phase_he
            if phase_he.startswith("מזהה"):
                label = f"מחפש: {targets_he}…"
            set_progress(
                job_id,
                percent=min(90.0, pct * 0.9),
                frames_done=done,
                frames_total=total,
                phase_he=label,
            )

        set_progress(
            job_id,
            percent=1,
            phase_he=f"טוען מודל · יחפש: {targets_he}",
            frames_total=int(asset.frame_count or 0),
        )

        result = await asyncio.to_thread(
            lambda: run_video_lab_analysis(
                video_path=asset.stored_path,
                camera_id=asset.camera_id,
                prefer_onnx=use_onnx,
                model_path=model_path if use_onnx else None,
                on_progress=_on_progress,
                target_classes=target_classes,
                frame_stride=runtime.frame_stride,
            )
        )

        set_progress(
            job_id,
            percent=92,
            frames_done=result.metrics.frames_analyzed_by_detector,
            frames_total=result.metrics.frames_read or result.metrics.frames_analyzed_by_detector,
            phase_he="מפעיל חוקים…",
        )

        # Batch rule evaluation — never publish one DB session per detection frame
        event_ids = list(await publish_and_collect(result.detections))

        event_rows: list[Event] = []
        for eid in event_ids:
            row = await session.get(Event, eid)
            if row is None:
                continue
            payload = dict(row.payload_json or {})
            payload["source"] = "development_video"
            payload["video_lab_asset_id"] = asset.id
            payload["video_lab_job_id"] = job.id
            if row.started_at is not None:
                started = row.started_at
                if started.tzinfo is None:
                    started = started.replace(tzinfo=UTC)
                payload["video_timestamp_sec"] = round(
                    float(started.timestamp() - result.base_unix_ts),
                    3,
                )
            row.payload_json = payload
            event_rows.append(row)
            if row.rule_id:
                rules_triggered.add(row.rule_id)

        set_progress(job_id, percent=96, phase_he="שומר גלריית זיהויים…")

        zones_result = await session.execute(select(Zone).where(Zone.camera_id == asset.camera_id))
        zones = list(zones_result.scalars().all())
        rules = all_rules

        first_seen = first_seen_by_class(result.detections, base_unix_ts=result.base_unix_ts)
        hits = build_hits_from_events(event_rows, base_unix_ts=result.base_unix_ts)
        rule_checks = diagnose_rules(
            camera_id=asset.camera_id,
            rules=rules,
            zones=zones,
            detections=result.detections,
            base_unix_ts=result.base_unix_ts,
            triggered_rule_ids=rules_triggered,
        )
        focus_timeline = build_focus_timeline(
            first_seen=first_seen,
            hits=hits,
            rule_checks=rule_checks,
        )

        unique_by_class = dict(result.metrics.unique_tracks_by_class)
        track_gallery = await asyncio.to_thread(
            lambda: build_track_result_images(
                video_path=asset.stored_path,
                job_id=job.id,
                results_dir=results_dir,
                track_gallery=result.track_gallery,
            )
        )
        # Attach representative images to events/hits when track matches
        gallery_by_tid = {int(c["track_id"]): c for c in track_gallery}
        for hit in hits:
            tid = hit.get("track_id")
            if tid is None:
                continue
            card = gallery_by_tid.get(int(tid))
            if card and card.get("has_image"):
                hit["image_url"] = card["image_url"]
                hit["image_key"] = card["image_key"]
                hit["confidence_pct"] = card.get("confidence_pct")
                hit["duration"] = card.get("duration")

        best_frames = await asyncio.to_thread(
            lambda: build_best_frame_cards(
                video_path=asset.stored_path,
                job_id=job.id,
                frames_dir=frames_dir,
                best_by_class=result.best_by_class,
                unique_tracks_by_class=unique_by_class,
            )
        )

        plural_he = {
            "person": "אנשים",
            "car": "מכוניות",
            "truck": "משאיות",
            "bus": "אוטובוסים",
            "bicycle": "אופניים",
            "motorcycle": "אופנועים",
        }
        objects_he = [
            f"{unique_by_class.get(cls, 0)} {plural_he.get(cls, class_he(cls))}"
            for cls in sorted(unique_by_class.keys())
        ]

        if not zones:
            guidance_he = "אין אזור למצלמה הווירטואלית — ציירו אזור ואז צרו חוק על האובייקט שאתם מחפשים."
        elif not rule_checks:
            guidance_he = "אין חוק מקושר למצלמה זו — צרו חוק עם סוג האובייקט והאזור לפני הרצת ניתוח."
        elif any(c["status"] == "triggered" for c in rule_checks):
            guidance_he = "יש התאמות לחוקים — עיינו בגלריית הזיהויים ובאירועים למטה."
        else:
            failed = next((c for c in rule_checks if c["status"] != "triggered"), None)
            guidance_he = failed["reason_he"] if failed else "הניתוח הושלם ללא אירועים."

        analysis_time_seconds = max(0.001, _time.perf_counter() - pipeline_t0)
        video_frames_total = int(result.metrics.frames_read or asset.frame_count or 0)
        detector_frames = int(result.metrics.frames_analyzed_by_detector or 0)
        proc_fps = processing_fps(
            video_frames_total=video_frames_total,
            analysis_time_seconds=analysis_time_seconds,
        )
        model_label = model_display_name(
            str(model_path) if model_path else None,
            result.metrics.detector_name,
        )
        detections_by_class = dict(result.metrics.class_counts)
        fp_empty = false_positive_stats([])

        benchmark_run = await benchmark_store.create_run_from_job(
            session,
            job=job,
            asset=asset,
            event_rows=event_rows,
            track_gallery=track_gallery,
            analysis_time_seconds=analysis_time_seconds,
            detector_model=model_label if not model_path else Path(str(model_path)).name,
            tracker_name=str(result.metrics.tracker_name),
            frame_stride=int(result.metrics.frame_stride),
            detector_confidence=dict(_DETECTOR_CONFIDENCE),
            detections_total=int(result.metrics.detections_count),
            detections_by_class=detections_by_class,
            unique_tracks_total=int(result.metrics.unique_tracks),
            unique_tracks_by_class=unique_by_class,
            video_frames_total=video_frames_total,
            detector_frames_analyzed=detector_frames,
            detector_calls=detector_frames,
            config_extra={
                "onnx_used": use_onnx,
                "model_path": str(model_path) if model_path else None,
                "runtime_config": result.metrics.runtime_config or runtime.to_dict(),
                "search_classes": target_classes,
            },
        )
        reviews = await benchmark_store.get_run_reviews(session, benchmark_run.id)
        benchmark_payload = benchmark_store.run_to_dict(benchmark_run, reviews)

        # Link events back to the durable benchmark run for UI navigation
        for row in event_rows:
            payload = dict(row.payload_json or {})
            payload["video_lab_run_id"] = benchmark_run.id
            row.payload_json = payload

        set_progress(job_id, percent=97, phase_he="יוצר מדיה לאירועים…")
        from app.domain.media import generate_media_for_video_lab_events

        await asyncio.to_thread(
            lambda: generate_media_for_video_lab_events(
                event_rows,
                video_path=asset.stored_path,
                detections=result.detections,
                base_unix_ts=result.base_unix_ts,
                video_duration_sec=float(result.metrics.video_duration_sec),
                analysis_run_id=benchmark_run.id,
                track_gallery=track_gallery,
            )
        )

        summary = {
            "message_he": "ניתוח הושלם",
            "guidance_he": guidance_he,
            "objects_he": objects_he,
            "search_classes": target_classes,
            "search_classes_he": [class_he(c) for c in target_classes],
            "class_counts": detections_by_class,
            "unique_tracks_by_class": unique_by_class,
            "first_seen_by_class": first_seen,
            "track_gallery": benchmark_payload["track_gallery"],
            "fragmentation_hints": result.fragmentation_hints,
            "best_frames": best_frames,
            "hits": hits,
            "rule_checks": rule_checks,
            "events_created": len(event_ids),
            "video_duration_sec": result.metrics.video_duration_sec,
            "analysis_duration_sec": analysis_time_seconds,
            "unique_tracks": result.metrics.unique_tracks,
            "detected_classes": sorted(unique_by_class.keys()),
            "tracker_name": result.metrics.tracker_name,
            "tracking_diagnostics": result.metrics.tracking_diagnostics,
            "rules_triggered": sorted(rules_triggered),
            "event_ids": event_ids,
            "base_unix_ts": result.base_unix_ts,
            "benchmark_run_id": benchmark_run.id,
            "benchmark": benchmark_payload,
        }
        metrics = {
            "video_duration_sec": result.metrics.video_duration_sec,
            "frames_read": result.metrics.frames_read,
            "frames_processed": result.metrics.frames_processed,
            "frames_analyzed_by_detector": detector_frames,
            "frame_stride": result.metrics.frame_stride,
            "average_processing_fps": round(proc_fps, 2),
            "detector_inference_ms_total": round(result.metrics.detector_inference_ms_total, 2),
            "detector_inference_ms_avg": round(result.metrics.detector_inference_ms_avg, 2),
            "total_analysis_sec": round(analysis_time_seconds, 3),
            "analysis_time_seconds": round(analysis_time_seconds, 3),
            "processing_fps": round(proc_fps, 3),
            "video_frames_total": video_frames_total,
            "detector_frames_analyzed": detector_frames,
            "detector_calls": detector_frames,
            "detections_total": int(result.metrics.detections_count),
            "detections_count": result.metrics.detections_count,
            "unique_tracks": result.metrics.unique_tracks,
            "unique_tracks_total": int(result.metrics.unique_tracks),
            "events_total": len(event_ids),
            "events_created": len(event_ids),
            "false_positives": fp_empty,
            "detector_name": result.metrics.detector_name,
            "tracker_name": result.metrics.tracker_name,
            "tracking_diagnostics": result.metrics.tracking_diagnostics,
            "runtime_config": result.metrics.runtime_config or runtime.to_dict(),
            "onnx_used": use_onnx,
            "model_path": str(model_path) if model_path else None,
            "class_counts": detections_by_class,
            "unique_tracks_by_class": unique_by_class,
            "benchmark_run_id": benchmark_run.id,
            "progress": {
                "percent": 100,
                "frames_done": detector_frames,
                "frames_total": video_frames_total or detector_frames,
                "phase_he": "הושלם",
            },
        }
        job.status = "completed"
        job.metrics_json = metrics
        job.summary_json = summary
        job.overlays_json = [
            {
                "frame_index": o.frame_index,
                "timestamp_sec": o.timestamp_sec,
                "boxes": o.boxes,
            }
            for o in result.overlays
        ]
        job.timeline_json = focus_timeline
        job.event_ids_json = event_ids
        job.finished_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(job)
        set_progress(job_id, percent=100, phase_he="הושלם", status="completed")
        clear_progress(job_id)
        return job
    except ValidationAppError as exc:
        job.status = "failed"
        job.error_he = exc.message
        job.finished_at = datetime.now(UTC)
        job.metrics_json = {
            **(job.metrics_json or {}),
            "progress": {"percent": 100, "phase_he": "נכשל", "frames_done": 0, "frames_total": 0},
        }
        await session.commit()
        await session.refresh(job)
        set_progress(job.id, percent=100, phase_he="נכשל", status="failed")
        raise
    except AppError:
        set_progress(job.id, percent=100, phase_he="נכשל", status="failed")
        raise
    except Exception as exc:
        logger.exception("video_lab_analysis_failed asset=%s", asset_id)
        job.status = "failed"
        job.error_he = "הניתוח נכשל. נסו שוב או בדקו את קובץ הווידאו."
        job.finished_at = datetime.now(UTC)
        job.metrics_json = {
            **(job.metrics_json or {}),
            "progress": {"percent": 100, "phase_he": "נכשל", "frames_done": 0, "frames_total": 0},
        }
        await session.commit()
        await session.refresh(job)
        set_progress(job.id, percent=100, phase_he="נכשל", status="failed")
        raise AppError(job.error_he, code="video_lab_failed", status_code=500) from exc
    finally:
        if owns_lock:
            analysis_lock.release(job.id)


def best_frame_path(job_id: str, image_key: str) -> Path:
    _, _, frames_dir, _, _ = _repo_paths()
    safe_key = "".join(ch for ch in image_key if ch.isalnum() or ch in {"_", "-"})
    return frames_dir / f"{job_id}_{safe_key}.jpg"


def track_image_path(job_id: str, track_id: int) -> Path:
    *_, results_dir = _repo_paths()
    safe_job = "".join(ch for ch in job_id if ch.isalnum() or ch in {"_", "-"})
    return results_dir / safe_job / f"track_{int(track_id):04d}.jpg"


def asset_to_dict(asset: VideoLabAsset) -> dict[str, Any]:
    return {
        "id": asset.id,
        "camera_id": asset.camera_id,
        "name_he": asset.name_he,
        "location": asset.location,
        "original_filename": asset.original_filename,
        "duration_sec": asset.duration_sec,
        "width": asset.width,
        "height": asset.height,
        "fps": asset.fps,
        "codec": asset.codec,
        "frame_count": asset.frame_count,
        "has_preview": bool(asset.preview_frame_path),
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
    }


def job_to_dict(job: VideoLabJob) -> dict[str, Any]:
    metrics = dict(job.metrics_json or {})
    live = get_progress(job.id)
    if live and job.status == "running":
        metrics["progress"] = live
    summary = dict(job.summary_json or {})
    return {
        "id": job.id,
        "asset_id": job.asset_id,
        "status": job.status,
        "error_he": job.error_he,
        "metrics": metrics,
        "summary": summary,
        "benchmark": summary.get("benchmark"),
        "benchmark_run_id": summary.get("benchmark_run_id") or metrics.get("benchmark_run_id"),
        "overlays": job.overlays_json,
        "timeline": job.timeline_json,
        "event_ids": job.event_ids_json,
        "progress": metrics.get("progress")
        or {
            "percent": 100 if job.status == "completed" else 0,
            "phase_he": "הושלם" if job.status == "completed" else "",
            "frames_done": 0,
            "frames_total": 0,
        },
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }
