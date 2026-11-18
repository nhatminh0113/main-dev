"""fixture: drop constraints without re-creating the same name"""

from alembic import op


def upgrade() -> None:
    op.drop_constraint("ck_tasks_priority", "tasks", type_="check")  # expect-unsafe
    op.drop_constraint("ck_tasks_title_length", "tasks", type_="check")  # expect-unsafe
    op.create_check_constraint(
        "ck_tasks_title_len", "tasks", "char_length(title) <= 500"
    )


def downgrade() -> None:
    op.drop_constraint("ck_tasks_title_len", "tasks", type_="check")
