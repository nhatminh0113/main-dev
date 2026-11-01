"""fixture: add nullable -> backfill -> NOT NULL on the new column"""

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.add_column("tasks", sa.Column("project_id", sa.Integer(), nullable=True))
    op.execute("UPDATE tasks SET project_id = 1")
    op.alter_column("tasks", "project_id", nullable=False)


def downgrade() -> None:
    op.drop_column("tasks", "project_id")
