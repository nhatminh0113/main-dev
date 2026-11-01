"""fixture: intentional contract step marked on the statement"""

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    # migration-safety: contract tasks.done unused since release 1.4 (reads completed_at)
    op.drop_column("tasks", "done")


def downgrade() -> None:
    op.add_column("tasks", sa.Column("done", sa.Boolean(), nullable=True))
