"""background job queue and feature flags (expand-only)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column(
            "payload",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now() + interval '24 hours'"),
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'done', 'failed')", name="ck_jobs_status"
        ),
        sa.CheckConstraint("attempts >= 0", name="ck_jobs_attempts"),
    )
    op.create_index(
        "ix_jobs_queued", "jobs", ["id"], postgresql_where=sa.text("status = 'queued'")
    )
    op.create_index(
        "ix_jobs_running_started_at",
        "jobs",
        ["started_at"],
        postgresql_where=sa.text("status = 'running'"),
    )
    op.create_index("ix_jobs_expires_at", "jobs", ["expires_at"])

    flags = op.create_table(
        "feature_flags",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("key ~ '^[a-z0-9_]+$'", name="ck_feature_flags_key"),
    )
    op.bulk_insert(
        flags,
        [
            {
                "key": "export_csv",
                "enabled": False,
                "description": "Xuất danh sách công việc ra tệp CSV (worker chạy nền)",
            },
            {
                "key": "week_view",
                "enabled": True,
                "description": "Màn Lịch tuần dạng thời khóa biểu",
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("feature_flags")
    op.drop_index("ix_jobs_expires_at", table_name="jobs")
    op.drop_index("ix_jobs_running_started_at", table_name="jobs")
    op.drop_index("ix_jobs_queued", table_name="jobs")
    op.drop_table("jobs")
