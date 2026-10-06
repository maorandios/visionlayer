"""Phase 0 foundation migration — creates alembic_version tracking only.

Product tables (cameras, zones, rules, events, users) arrive in Phase 1.
"""

from __future__ import annotations

from collections.abc import Sequence

revision: str = "0001_phase0_foundation"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Intentionally empty: establishes migration chain without product schema.
    pass


def downgrade() -> None:
    pass
