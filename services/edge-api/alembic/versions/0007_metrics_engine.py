"""Alembic: persistent Metrics Engine — samples, idempotency ledger, live state."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0007_metrics_engine"
down_revision: str | None = "0006_rule_engine_expansion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())

    if "metric_samples" not in tables:
        op.create_table(
            "metric_samples",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("sample_key", sa.String(length=400), nullable=False, unique=True),
            sa.Column("scope", sa.String(length=32), nullable=False, server_default="production"),
            sa.Column("analysis_run_id", sa.String(length=64), nullable=True),
            sa.Column("metric_type", sa.String(length=64), nullable=False),
            sa.Column("site_id", sa.String(length=64), nullable=True),
            sa.Column("camera_id", sa.String(length=64), nullable=True),
            sa.Column("zone_id", sa.String(length=64), nullable=True),
            sa.Column("line_id", sa.String(length=64), nullable=True),
            sa.Column("object_class", sa.String(length=64), nullable=True),
            sa.Column("direction", sa.String(length=32), nullable=True),
            sa.Column("bucket", sa.String(length=16), nullable=False),
            sa.Column("bucket_start", sa.DateTime(timezone=True), nullable=False),
            sa.Column("value", sa.Float(), nullable=False, server_default="0"),
            sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("sum_value", sa.Float(), nullable=False, server_default="0"),
            sa.Column("min_value", sa.Float(), nullable=True),
            sa.Column("max_value", sa.Float(), nullable=True),
            sa.Column("peak_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
        )
        op.create_index("ix_metric_samples_scope", "metric_samples", ["scope"])
        op.create_index("ix_metric_samples_analysis_run_id", "metric_samples", ["analysis_run_id"])
        op.create_index("ix_metric_samples_metric_type", "metric_samples", ["metric_type"])
        op.create_index("ix_metric_samples_camera_id", "metric_samples", ["camera_id"])
        op.create_index("ix_metric_samples_bucket_start", "metric_samples", ["bucket_start"])

    if "metric_ledger" not in tables:
        op.create_table(
            "metric_ledger",
            sa.Column("source_key", sa.String(length=400), primary_key=True),
            sa.Column("scope", sa.String(length=32), nullable=False, server_default="production"),
            sa.Column("analysis_run_id", sa.String(length=64), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
        )
        op.create_index("ix_metric_ledger_analysis_run_id", "metric_ledger", ["analysis_run_id"])

    if "metric_state" not in tables:
        op.create_table(
            "metric_state",
            sa.Column("state_key", sa.String(length=400), primary_key=True),
            sa.Column("scope", sa.String(length=32), nullable=False, server_default="production"),
            sa.Column("analysis_run_id", sa.String(length=64), nullable=True),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column("camera_id", sa.String(length=64), nullable=True),
            sa.Column("zone_id", sa.String(length=64), nullable=True),
            sa.Column("value_json", sa.JSON(), nullable=False),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
        )
        op.create_index("ix_metric_state_scope", "metric_state", ["scope"])
        op.create_index("ix_metric_state_analysis_run_id", "metric_state", ["analysis_run_id"])
        op.create_index("ix_metric_state_camera_id", "metric_state", ["camera_id"])


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    for name in ("metric_state", "metric_ledger", "metric_samples"):
        if name in tables:
            op.drop_table(name)
