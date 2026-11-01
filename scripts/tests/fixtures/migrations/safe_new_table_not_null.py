"""fixture: NOT NULL on a column of a table created in the same upgrade"""

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("body", sa.Text(), nullable=True),
    )
    op.alter_column("notes", "body", nullable=False)


def downgrade() -> None:
    op.drop_table("notes")
