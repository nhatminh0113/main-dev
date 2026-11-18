"""fixture: destructive op hidden in a helper called from upgrade"""

from alembic import op


def _drop_legacy() -> None:
    op.drop_table("legacy")  # expect-unsafe


def _cleanup() -> None:
    _drop_legacy()


def upgrade() -> None:
    _cleanup()


def downgrade() -> None:
    pass
