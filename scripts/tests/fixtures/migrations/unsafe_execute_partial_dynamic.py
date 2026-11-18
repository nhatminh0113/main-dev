"""fixture: a constant SQL prefix joined with a runtime value cannot be checked"""

from alembic import op

CLAUSE = "DROP COLUMN priority"


def upgrade() -> None:
    op.execute("ALTER TABLE tasks " + CLAUSE)  # expect-unsafe
    op.execute(f"ALTER TABLE tasks {CLAUSE}")  # expect-unsafe


def downgrade() -> None:
    pass
