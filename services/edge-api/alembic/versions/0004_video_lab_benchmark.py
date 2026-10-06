"""Alembic revision: Video Lab Benchmark Runs + track reviews."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_video_lab_benchmark"
down_revision: str | None = "0003_video_lab"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "video_analysis_runs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("job_id", sa.String(length=64), nullable=False),
        sa.Column("asset_id", sa.String(length=64), nullable=False),
        sa.Column("camera_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="completed"),
        sa.Column("detector_model", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("tracker_name", sa.String(length=64), nullable=False, server_default="bytetrack"),
        sa.Column("frame_stride", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("detector_confidence_json", sa.JSON(), nullable=False),
        sa.Column("video_duration_sec", sa.Float(), nullable=False, server_default="0"),
        sa.Column("source_video_fps", sa.Float(), nullable=False, server_default="0"),
        sa.Column("video_width", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("video_height", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("video_frames_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("detector_frames_analyzed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("detector_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("detections_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("detections_by_class_json", sa.JSON(), nullable=False),
        sa.Column("unique_tracks_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unique_tracks_by_class_json", sa.JSON(), nullable=False),
        sa.Column("events_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("events_by_rule_json", sa.JSON(), nullable=False),
        sa.Column("events_by_type_json", sa.JSON(), nullable=False),
        sa.Column("event_ids_json", sa.JSON(), nullable=False),
        sa.Column("analysis_time_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("processing_fps", sa.Float(), nullable=False, server_default="0"),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("track_gallery_json", sa.JSON(), nullable=False),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["job_id"], ["video_lab_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["asset_id"], ["video_lab_assets.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("job_id", name="uq_video_analysis_runs_job_id"),
    )
    op.create_index("ix_video_analysis_runs_asset_id", "video_analysis_runs", ["asset_id"])
    op.create_index("ix_video_analysis_runs_camera_id", "video_analysis_runs", ["camera_id"])
    op.create_index("ix_video_analysis_runs_analyzed_at", "video_analysis_runs", ["analyzed_at"])

    op.create_table(
        "video_analysis_track_reviews",
        sa.Column("run_id", sa.String(length=64), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=False),
        sa.Column(
            "review_status",
            sa.String(length=32),
            nullable=False,
            server_default="unreviewed",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["run_id"], ["video_analysis_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("run_id", "track_id"),
    )


def downgrade() -> None:
    op.drop_table("video_analysis_track_reviews")
    op.drop_index("ix_video_analysis_runs_analyzed_at", table_name="video_analysis_runs")
    op.drop_index("ix_video_analysis_runs_camera_id", table_name="video_analysis_runs")
    op.drop_index("ix_video_analysis_runs_asset_id", table_name="video_analysis_runs")
    op.drop_table("video_analysis_runs")
