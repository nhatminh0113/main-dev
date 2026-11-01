"""fixture: raw SQL ALTER ... TYPE"""

from alembic import op


def upgrade() -> None:
    op.execute("alter table tasks alter column priority type integer")  # expect-unsafe


def downgrade() -> None:
    pass
