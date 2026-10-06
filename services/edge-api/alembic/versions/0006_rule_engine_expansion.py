"""Alembic: spatial lines + lightweight counter state."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0006_rule_engine_expansion"
down_revision: str | None = "0005_event_media"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "lines" not in tables:
        op.create_table(
            "lines",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column(
                "camera_id",
                sa.String(length=64),
                sa.ForeignKey("cameras.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("points_json", sa.JSON(), nullable=False),
            sa.Column("direction", sa.String(length=32), nullable=False, server_default="any"),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
        )
        op.create_index("ix_lines_camera_id", "lines", ["camera_id"])
    else:
        indexes = {ix["name"] for ix in inspector.get_indexes("lines")}
        if "ix_lines_camera_id" not in indexes:
            op.create_index("ix_lines_camera_id", "lines", ["camera_id"])

    if "counter_states" not in tables:
        op.create_table(
            "counter_states",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("counter_key", sa.String(length=255), nullable=False, unique=True),
            sa.Column("camera_id", sa.String(length=64), nullable=True),
            sa.Column("zone_id", sa.String(length=64), nullable=True),
            sa.Column("line_id", sa.String(length=64), nullable=True),
            sa.Column("object_class", sa.String(length=64), nullable=True),
            sa.Column("direction", sa.String(length=32), nullable=True),
            sa.Column("rule_id", sa.String(length=64), nullable=True),
            sa.Column("value", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("track_ids_json", sa.JSON(), nullable=False),
            sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("threshold_fired", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "counter_states" in tables:
        op.drop_table("counter_states")
    if "lines" in tables:
        indexes = {ix["name"] for ix in inspector.get_indexes("lines")}
        if "ix_lines_camera_id" in indexes:
            op.drop_index("ix_lines_camera_id", table_name="lines")
        op.drop_table("lines")
