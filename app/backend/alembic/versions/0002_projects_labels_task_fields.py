"""projects, labels and richer tasks (Todoist-style)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INBOX_NAME = "Hộp thư đến"


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )


def upgrade() -> None:
    # Accent-insensitive search ("hoc" finds "Học"). Trusted extension: no superuser needed.
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")

    # ---------- projects ----------
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False, server_default="grey"),
        sa.Column("is_inbox", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        _created_at(),
    )
    # At most one Inbox
    op.create_index(
        "uq_projects_single_inbox",
        "projects",
        ["is_inbox"],
        unique=True,
        postgresql_where=sa.text("is_inbox"),
    )
    op.execute(
        sa.text(
            "INSERT INTO projects (name, color, is_inbox, position) "
            "VALUES (:name, 'grey', true, 0)"
        ).bindparams(name=INBOX_NAME)
    )

    # ---------- labels ----------
    op.create_table(
        "labels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False, server_default="grey"),
        _created_at(),
    )
    op.create_index("uq_labels_name_lower", "labels", [sa.text("lower(name)")], unique=True)

    # ---------- tasks: new columns ----------
    op.add_column("tasks", sa.Column("project_id", sa.Integer(), nullable=True))
    op.execute("UPDATE tasks SET project_id = (SELECT id FROM projects WHERE is_inbox)")
    op.alter_column("tasks", "project_id", nullable=False)
    op.create_foreign_key(
        "fk_tasks_project_id", "tasks", "projects", ["project_id"], ["id"], ondelete="CASCADE"
    )
    op.add_column("tasks", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_parent_id", "tasks", "tasks", ["parent_id"], ["id"], ondelete="CASCADE"
    )
    op.add_column(
        "tasks", sa.Column("description", sa.Text(), nullable=False, server_default="")
    )
    op.add_column(
        "tasks", sa.Column("priority", sa.SmallInteger(), nullable=False, server_default="4")
    )
    op.create_check_constraint("ck_tasks_priority", "tasks", "priority BETWEEN 1 AND 4")
    op.add_column("tasks", sa.Column("due_date", sa.Date(), nullable=True))
    op.add_column("tasks", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE tasks SET completed_at = now() WHERE done")
    op.add_column("tasks", sa.Column("position", sa.Integer(), nullable=False, server_default="0"))
    op.execute("UPDATE tasks SET position = id")
    op.add_column(
        "tasks",
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    # Title limit 200 -> 500
    op.drop_constraint("ck_tasks_title_length", "tasks", type_="check")
    op.alter_column("tasks", "title", type_=sa.String(length=500))
    op.create_check_constraint(
        "ck_tasks_title_length", "tasks", "char_length(title) BETWEEN 1 AND 500"
    )

    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])
    op.create_index("ix_tasks_parent_id", "tasks", ["parent_id"])
    op.create_index(
        "ix_tasks_open_due_date", "tasks", ["due_date"], postgresql_where=sa.text("NOT done")
    )

    # ---------- task_labels ----------
    op.create_table(
        "task_labels",
        sa.Column(
            "task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column(
            "label_id",
            sa.Integer(),
            sa.ForeignKey("labels.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("task_labels")

    op.drop_index("ix_tasks_open_due_date", table_name="tasks")
    op.drop_index("ix_tasks_parent_id", table_name="tasks")
    op.drop_index("ix_tasks_project_id", table_name="tasks")

    op.drop_constraint("ck_tasks_title_length", "tasks", type_="check")
    op.execute("UPDATE tasks SET title = left(title, 200)")
    op.alter_column("tasks", "title", type_=sa.String(length=200))
    op.create_check_constraint(
        "ck_tasks_title_length", "tasks", "char_length(title) BETWEEN 1 AND 200"
    )

    # Subtasks are kept as plain tasks (only the parent link is dropped).
    op.drop_constraint("fk_tasks_parent_id", "tasks", type_="foreignkey")
    op.drop_constraint("ck_tasks_priority", "tasks", type_="check")
    for column in ("updated_at", "position", "completed_at", "due_date", "priority"):
        op.drop_column("tasks", column)
    op.drop_column("tasks", "description")
    op.drop_column("tasks", "parent_id")
    op.drop_constraint("fk_tasks_project_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "project_id")

    op.drop_index("uq_labels_name_lower", table_name="labels")
    op.drop_table("labels")
    op.drop_index("uq_projects_single_inbox", table_name="projects")
    op.drop_table("projects")
    # The unaccent extension is left installed: other objects may depend on it.
