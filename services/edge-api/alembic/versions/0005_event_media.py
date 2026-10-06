"""Event media fields — snapshot, clip status, video trigger metadata."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0005_event_media"
down_revision: str | None = "0004_video_lab_benchmark"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("snapshot_path", sa.String(length=500), nullable=True))
    op.add_column(
        "events",
        sa.Column("media_status", sa.String(length=32), nullable=False, server_default="none"),
    )
    op.add_column("events", sa.Column("trigger_timestamp_sec", sa.Float(), nullable=True))
    op.add_column(
        "events",
        sa.Column("source_analysis_run_id", sa.String(length=64), nullable=True),
    )
    # Legacy thumbnail_path retained; snapshot_path is canonical for event evidence JPEG.


def downgrade() -> None:
    op.drop_column("events", "source_analysis_run_id")
    op.drop_column("events", "trigger_timestamp_sec")
    op.drop_column("events", "media_status")
    op.drop_column("events", "snapshot_path")
