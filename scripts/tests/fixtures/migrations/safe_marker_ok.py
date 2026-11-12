"""fixture: statement markers (trailing and in the comment block above)"""

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    # migration-safety: ok widening NUMERIC(10) to NUMERIC(12) never loses data
    # (the previous release reads the column as Decimal either way)
    op.alter_column("orders", "amount", type_=sa.Numeric(12))
    op.execute(
        "DROP VIEW IF EXISTS v_stats"
    )  # migration-safety: ok view is recreated below
    op.execute("CREATE VIEW v_stats AS SELECT 1")


def downgrade() -> None:
    op.alter_column("orders", "amount", type_=sa.Numeric(10))
