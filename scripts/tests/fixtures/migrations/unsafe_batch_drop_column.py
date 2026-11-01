"""fixture: drop a column in batch mode"""

from alembic import op


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("done")  # expect-unsafe


def downgrade() -> None:
    pass
