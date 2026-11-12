"""fixture: widen a column by dropping and re-creating the same check constraint"""

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.drop_constraint("ck_tasks_title_length", "tasks", type_="check")
    # migration-safety: ok widening VARCHAR(200) to VARCHAR(500) is backward compatible
    op.alter_column("tasks", "title", type_=sa.String(length=500))
    op.create_check_constraint(
        "ck_tasks_title_length", "tasks", "char_length(title) BETWEEN 1 AND 500"
    )
    op.drop_constraint("fk_tasks_project_id", "tasks", type_="foreignkey")
    op.create_foreign_key(
        "fk_tasks_project_id",
        "tasks",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("ck_tasks_title_length", "tasks", type_="check")
    op.alter_column("tasks", "title", type_=sa.String(length=200))
