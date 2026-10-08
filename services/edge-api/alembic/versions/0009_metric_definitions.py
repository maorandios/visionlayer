"""Alembic: metric_definitions — user-configured continuous measurements per camera."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0009_metric_definitions"
down_revision: str | None = "0008_line_side_labels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "metric_definitions" in tables:
        return

    op.create_table(
        "metric_definitions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("camera_id", sa.String(length=64), sa.ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("metric_type", sa.String(length=64), nullable=False),
        sa.Column("object_type", sa.String(length=64), nullable=False),
        sa.Column("object_classes_json", sa.JSON(), nullable=False),
        sa.Column("scope_type", sa.String(length=32), nullable=False, server_default="camera"),
        sa.Column("zone_id", sa.String(length=64), nullable=True),
        sa.Column("line_id", sa.String(length=64), nullable=True),
        sa.Column("direction", sa.String(length=32), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_metric_definitions_camera_id", "metric_definitions", ["camera_id"])
    op.create_index("ix_metric_definitions_metric_type", "metric_definitions", ["metric_type"])


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "metric_definitions" not in tables:
        return
    op.drop_index("ix_metric_definitions_metric_type", table_name="metric_definitions")
    op.drop_index("ix_metric_definitions_camera_id", table_name="metric_definitions")
    op.drop_table("metric_definitions")
