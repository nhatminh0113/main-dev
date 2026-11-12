"""fixture: batch mode add column + NOT NULL on the new column"""

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.add_column(sa.Column("note", sa.Text(), nullable=True))
        batch.alter_column("note", nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("note")
