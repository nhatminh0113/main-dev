"""fixture: raw SQL RENAME (multi-line sa.text)"""

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.execute(  # expect-unsafe
        sa.text(
            "ALTER TABLE tasks_with_a_rather_long_name_for_this_fixture "
            "RENAME COLUMN title TO name"
        )
    )


def downgrade() -> None:
    op.execute("ALTER TABLE tasks RENAME COLUMN name TO title")
