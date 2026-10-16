"""Migration 0002 must keep data created with the original schema (0001)."""

from alembic import command
from sqlalchemy import text

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
