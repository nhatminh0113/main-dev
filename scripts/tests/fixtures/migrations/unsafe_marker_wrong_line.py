"""fixture: a marker separated from the op by a code line does not apply"""

from alembic import op


def upgrade() -> None:
    # migration-safety: contract tasks.done unused since release 1.4
    op.create_index("ix_tasks_title", "tasks", ["title"])
    op.drop_column("tasks", "done")  # expect-unsafe


def downgrade() -> None:
    pass
