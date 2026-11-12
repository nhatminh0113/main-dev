"""fixture: NOT NULL on a column that already existed"""

from alembic import op


def upgrade() -> None:
    op.alter_column("tasks", "due_date", nullable=False)  # expect-unsafe


def downgrade() -> None:
    op.alter_column("tasks", "due_date", nullable=True)
