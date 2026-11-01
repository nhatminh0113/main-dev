"""fixture: raw SQL SET NOT NULL on an existing column"""

from alembic import op


def upgrade() -> None:
    op.execute("ALTER TABLE tasks ALTER COLUMN due_date SET NOT NULL")  # expect-unsafe


def downgrade() -> None:
    op.execute("ALTER TABLE tasks ALTER COLUMN due_date DROP NOT NULL")
