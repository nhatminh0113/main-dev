"""fixture: marker with a reason that is too short is rejected"""

from alembic import op


def upgrade() -> None:
    # expect-unsafe-next (a trailing comment would become part of the marker reason)
    # migration-safety: contract later
    op.drop_column("tasks", "done")  # expect-unsafe


def downgrade() -> None:
    pass
