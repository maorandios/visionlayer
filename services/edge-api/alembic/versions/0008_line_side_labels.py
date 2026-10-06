"""Alembic: optional human-readable side labels for crossing lines (Rule Wizard)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0008_line_side_labels"
down_revision: str | None = "0007_metrics_engine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in inspect(bind).get_columns("lines")}
    with op.batch_alter_table("lines") as batch:
        if "label_a_to_b" not in columns:
            batch.add_column(sa.Column("label_a_to_b", sa.String(length=100), nullable=True))
        if "label_b_to_a" not in columns:
            batch.add_column(sa.Column("label_b_to_a", sa.String(length=100), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in inspect(bind).get_columns("lines")}
    with op.batch_alter_table("lines") as batch:
        if "label_b_to_a" in columns:
            batch.drop_column("label_b_to_a")
        if "label_a_to_b" in columns:
            batch.drop_column("label_a_to_b")
