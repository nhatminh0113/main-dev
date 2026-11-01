"""optional start time and duration on tasks (weekly timetable)

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("due_time", sa.Time(), nullable=True))
    op.add_column("tasks", sa.Column("duration_minutes", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        "ck_tasks_time_needs_date", "tasks", "due_time IS NULL OR due_date IS NOT NULL"
    )
    op.create_check_constraint(
        "ck_tasks_duration",
        "tasks",
        "duration_minutes IS NULL OR (due_time IS NOT NULL AND duration_minutes BETWEEN 15 AND 720)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_tasks_duration", "tasks", type_="check")
    op.drop_constraint("ck_tasks_time_needs_date", "tasks", type_="check")
    op.drop_column("tasks", "duration_minutes")
    op.drop_column("tasks", "due_time")
