"""fixture: rename a column"""

from alembic import op


def upgrade() -> None:
    op.alter_column("tasks", "title", new_column_name="name")  # expect-unsafe


def downgrade() -> None:
    op.alter_column("tasks", "name", new_column_name="title")
