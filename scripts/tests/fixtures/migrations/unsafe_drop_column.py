"""fixture: drop a column in upgrade"""

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.drop_column("tasks", "done")  # expect-unsafe


def downgrade() -> None:
    op.add_column("tasks", sa.Column("done", sa.Boolean(), nullable=True))
