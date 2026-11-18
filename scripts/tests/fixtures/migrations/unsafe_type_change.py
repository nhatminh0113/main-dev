"""fixture: change a column type (may narrow)"""

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.alter_column("tasks", "title", type_=sa.String(length=50))  # expect-unsafe


def downgrade() -> None:
    op.alter_column("tasks", "title", type_=sa.String(length=500))
