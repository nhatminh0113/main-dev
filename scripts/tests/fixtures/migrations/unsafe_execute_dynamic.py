"""fixture: SQL built at runtime cannot be checked"""

from alembic import op

STATEMENTS: list[str] = []


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)  # expect-unsafe


def downgrade() -> None:
    pass
