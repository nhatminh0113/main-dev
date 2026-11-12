"""fixture: unknown marker kind is rejected"""

from alembic import op


def upgrade() -> None:
    # expect-unsafe-next
    # migration-safety: skip this check for the drop below
    op.drop_table("labels")  # expect-unsafe


def downgrade() -> None:
    pass
