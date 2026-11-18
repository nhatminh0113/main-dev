"""fixture: whole-file contract marker"""

# migration-safety-file: contract legacy tables unused since release 1.4

from alembic import op


def upgrade() -> None:
    op.drop_table("legacy_tags")
    op.drop_column("tasks", "legacy_tag_id")


def downgrade() -> None:
    pass
