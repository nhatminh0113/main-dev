"""rename the Inbox project to "Ghi nhanh"

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _rename(name: str) -> None:
    op.execute(sa.text("UPDATE projects SET name = :name WHERE is_inbox").bindparams(name=name))


def upgrade() -> None:
    _rename("Ghi nhanh")


def downgrade() -> None:
    _rename("Hộp thư đến")
