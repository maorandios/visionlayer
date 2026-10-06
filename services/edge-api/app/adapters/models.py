"""SQLAlchemy ORM models for Phase 1 Product Core."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.adapters.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="admin")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    # RTSP/ONVIF fields reserved for Phase 3 — nullable placeholders
    rtsp_url_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    onvif_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    username_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    zones: Mapped[list[Zone]] = relationship(back_populates="camera", cascade="all, delete-orphan")


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    camera_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="polygon")
    points_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    direction: Mapped[str | None] = mapped_column(String(32), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    camera: Mapped[Camera] = relationship(back_populates="zones")


class Line(Base):
    """Directional line for crossing rules (two normalized endpoints)."""

    __tablename__ = "lines"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    camera_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    points_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    direction: Mapped[str] = mapped_column(String(32), nullable=False, default="any")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class CounterStateRow(Base):
    """Optional persisted unique-count bucket (in-memory CounterStore is primary)."""

    __tablename__ = "counter_states"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    counter_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    camera_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    zone_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    line_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    object_class: Mapped[str | None] = mapped_column(String(64), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(32), nullable=True)
    rule_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    track_ids_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    window_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    threshold_fired: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class MetricSample(Base):
    """Accumulated metric value for one dimension set + time bucket.

    One row per (scope, analysis_run_id, metric_type, dims..., bucket, bucket_start).
    `sample_key` is the deterministic serialization of that tuple (unique).
    """

    __tablename__ = "metric_samples"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sample_key: Mapped[str] = mapped_column(String(400), nullable=False, unique=True)
    scope: Mapped[str] = mapped_column(String(32), nullable=False, default="production", index=True)
    analysis_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    metric_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    site_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    camera_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    zone_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    line_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    object_class: Mapped[str | None] = mapped_column(String(64), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(32), nullable=True)
    bucket: Mapped[str] = mapped_column(String(16), nullable=False)  # hour | day | week | month
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    value: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sum_value: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    min_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    peak_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class MetricLedger(Base):
    """Idempotency ledger: one row per applied (source occurrence × metric)."""

    __tablename__ = "metric_ledger"

    source_key: Mapped[str] = mapped_column(String(400), primary_key=True)
    scope: Mapped[str] = mapped_column(String(32), nullable=False, default="production")
    analysis_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MetricState(Base):
    """Live (non-bucketed) state such as current zone occupancy."""

    __tablename__ = "metric_state"

    state_key: Mapped[str] = mapped_column(String(400), primary_key=True)
    scope: Mapped[str] = mapped_column(String(32), nullable=False, default="production", index=True)
    analysis_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    camera_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    zone_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    value_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    conditions_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    actions_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    cooldown_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skill_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    camera_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    rule_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    skill_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False, default="warning")
    object_class: Mapped[str | None] = mapped_column(String(64), nullable=True)
    track_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    zone_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="new")
    thumbnail_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    snapshot_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    clip_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    media_status: Mapped[str] = mapped_column(String(32), nullable=False, default="none")
    trigger_timestamp_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_analysis_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    message_he: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class VideoLabAsset(Base):
    """Uploaded development video treated as a virtual camera source."""

    __tablename__ = "video_lab_assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    camera_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name_he: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    preview_frame_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_sec: Mapped[float] = mapped_column(Float, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    fps: Mapped[float] = mapped_column(Float, nullable=False)
    codec: Mapped[str] = mapped_column(String(64), nullable=False, default="unknown")
    frame_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class VideoLabJob(Base):
    __tablename__ = "video_lab_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    asset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("video_lab_assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    error_he: Mapped[str | None] = mapped_column(Text, nullable=True)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    summary_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    overlays_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    timeline_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    event_ids_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class VideoAnalysisRun(Base):
    """Persistent Benchmark Run for one Video Lab analysis (never overwritten)."""

    __tablename__ = "video_analysis_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("video_lab_jobs.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    asset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("video_lab_assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    camera_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed")
    detector_model: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    tracker_name: Mapped[str] = mapped_column(String(64), nullable=False, default="bytetrack")
    frame_stride: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    detector_confidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    video_duration_sec: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    source_video_fps: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    video_width: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    video_height: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    video_frames_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    detector_frames_analyzed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    detector_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    detections_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    detections_by_class_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    unique_tracks_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unique_tracks_by_class_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    events_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    events_by_rule_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    events_by_type_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    event_ids_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    analysis_time_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    processing_fps: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    track_gallery_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class VideoAnalysisTrackReview(Base):
    """Manual review of a unique track within a Benchmark Run."""

    __tablename__ = "video_analysis_track_reviews"

    run_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("video_analysis_runs.id", ondelete="CASCADE"), primary_key=True
    )
    track_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    review_status: Mapped[str] = mapped_column(String(32), nullable=False, default="unreviewed")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value_json: Mapped[Any] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    actor: Mapped[str | None] = mapped_column(String(128), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
