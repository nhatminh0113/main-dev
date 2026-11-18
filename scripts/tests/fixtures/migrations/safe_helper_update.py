"""fixture: data-only helper called from upgrade (UPDATE is allowed)"""

import sqlalchemy as sa
from alembic import op


def _rename(name: str) -> None:
    op.execute(
        sa.text("UPDATE projects SET name = :name WHERE is_inbox").bindparams(name=name)
    )


def _cleanup() -> None:
    op.drop_table("projects")


def upgrade() -> None:
    _rename("Ghi nhanh")


def downgrade() -> None:
    _rename("Inbox")
    _cleanup()
