"""fixture: raw SQL DROP"""

from alembic import op


def upgrade() -> None:
    op.execute("ALTER TABLE tasks DROP COLUMN done")  # expect-unsafe


def downgrade() -> None:
    op.execute("ALTER TABLE tasks ADD COLUMN done boolean")
