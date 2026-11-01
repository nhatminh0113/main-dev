"""Migrations must keep data created with older schemas (0002 from 0001, 0005 from 0004)."""

from alembic import command
from sqlalchemy import Connection, text

from app.db import get_engine
from tests.conftest import alembic_config


def test_existing_tasks_move_to_inbox_on_upgrade() -> None:
    cfg = alembic_config()
    engine = get_engine()
    command.downgrade(cfg, "0001")
    try:
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO tasks (title, done) VALUES ('old open', false)"))
            conn.execute(text("INSERT INTO tasks (title, done) VALUES ('old done', true)"))
    finally:
        command.upgrade(cfg, "head")

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT t.title, p.is_inbox, t.priority, t.description, "
                "t.completed_at IS NOT NULL AS has_completed_at "
                "FROM tasks t JOIN projects p ON p.id = t.project_id ORDER BY t.id"
            )
        ).all()

    assert [tuple(r) for r in rows] == [
        ("old open", True, 4, "", False),
        ("old done", True, 4, "", True),
    ]


def _table_exists(conn: Connection, name: str) -> bool:
    return conn.execute(text("SELECT to_regclass(:name) IS NOT NULL"), {"name": name}).scalar_one()


def test_0005_preserves_tasks_and_seeds_flags() -> None:
    """Expand-only: 0004-era data survives 0005 and the two flags are seeded."""
    cfg = alembic_config()
    engine = get_engine()
    command.downgrade(cfg, "0004")
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO tasks (project_id, title, due_date, due_time, duration_minutes) "
                    "SELECT id, 'kept task', DATE '2026-10-25', TIME '09:30', 45 "
                    "FROM projects WHERE is_inbox"
                )
            )
        command.upgrade(cfg, "0005")
        with engine.connect() as conn:
            task = conn.execute(text("SELECT title, due_time, duration_minutes FROM tasks")).one()
            flags = conn.execute(
                text("SELECT key, enabled, description <> '' FROM feature_flags ORDER BY key")
            ).all()
            jobs_count = conn.execute(text("SELECT count(*) FROM jobs")).scalar_one()
        assert (task.title, task.due_time.isoformat(), task.duration_minutes) == (
            "kept task",
            "09:30:00",
            45,
        )
        assert [tuple(f) for f in flags] == [("export_csv", False, True), ("week_view", True, True)]
        assert jobs_count == 0
    finally:
        command.upgrade(cfg, "head")


def test_0005_downgrade_drops_new_tables_only() -> None:
    cfg = alembic_config()
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO tasks (project_id, title) SELECT id, 'survivor' FROM projects")
        )
    command.downgrade(cfg, "0004")
    try:
        with engine.connect() as conn:
            assert not _table_exists(conn, "public.jobs")
            assert not _table_exists(conn, "public.feature_flags")
            for table in ("tasks", "projects", "labels", "task_labels"):
                assert _table_exists(conn, f"public.{table}")
            titles = conn.execute(text("SELECT title FROM tasks")).scalars().all()
        assert titles == ["survivor"]
    finally:
        command.upgrade(cfg, "head")
