"""Alembic revision: Video Test Lab tables."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_video_lab"
down_revision: str | None = "0002_phase1_product_core"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "video_lab_assets",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("camera_id", sa.String(length=64), nullable=False),
        sa.Column("name_he", sa.String(length=200), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_path", sa.String(length=500), nullable=False),
        sa.Column("preview_frame_path", sa.String(length=500), nullable=True),
        sa.Column("duration_sec", sa.Float(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("fps", sa.Float(), nullable=False),
        sa.Column("codec", sa.String(length=64), nullable=False, server_default="unknown"),
        sa.Column("frame_count", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["camera_id"], ["cameras.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_video_lab_assets_camera_id", "video_lab_assets", ["camera_id"])

    op.create_table(
        "video_lab_jobs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("asset_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("error_he", sa.Text(), nullable=True),
        sa.Column("metrics_json", sa.JSON(), nullable=False),
        sa.Column("summary_json", sa.JSON(), nullable=False),
        sa.Column("overlays_json", sa.JSON(), nullable=False),
        sa.Column("timeline_json", sa.JSON(), nullable=False),
        sa.Column("event_ids_json", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["video_lab_assets.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_video_lab_jobs_asset_id", "video_lab_jobs", ["asset_id"])


def downgrade() -> None:
    op.drop_index("ix_video_lab_jobs_asset_id", table_name="video_lab_jobs")
    op.drop_table("video_lab_jobs")
    op.drop_index("ix_video_lab_assets_camera_id", table_name="video_lab_assets")
    op.drop_table("video_lab_assets")
