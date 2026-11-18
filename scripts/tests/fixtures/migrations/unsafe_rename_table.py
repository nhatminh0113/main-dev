"""fixture: rename a table"""

from alembic import op


def upgrade() -> None:
    op.rename_table("tasks", "todos")  # expect-unsafe


def downgrade() -> None:
    op.rename_table("todos", "tasks")
