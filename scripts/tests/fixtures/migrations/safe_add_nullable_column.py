"""fixture: add a nullable column (expand)"""

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.add_column("tasks", sa.Column("note", sa.Text(), nullable=True))
    op.create_index("ix_tasks_note", "tasks", ["note"])


def downgrade() -> None:
    op.drop_index("ix_tasks_note", table_name="tasks")
    op.drop_column("tasks", "note")
