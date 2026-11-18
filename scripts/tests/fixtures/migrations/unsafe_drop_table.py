"""fixture: drop a table in upgrade"""

from alembic import op


def upgrade() -> None:
    op.drop_table("labels")  # expect-unsafe


def downgrade() -> None:
    pass
