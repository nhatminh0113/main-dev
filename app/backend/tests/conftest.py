"""Shared pytest fixtures.

Tests run against a real PostgreSQL database. Point TEST_DATABASE_URL at it, e.g.:

    docker run -d --name taskapp-test-db -p 5433:5432 \
      -e POSTGRES_USER=taskapp -e POSTGRES_PASSWORD=taskapp -e POSTGRES_DB=taskapp_test \
      postgres:18.6-alpine
"""

import os
from collections.abc import Iterator
from pathlib import Path

# Must be set before the application (and its settings) is imported.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://taskapp:taskapp@localhost:5433/taskapp_test",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import get_engine  # noqa: E402
from app.main import app  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent


def alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return cfg


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> Iterator[None]:
    """Apply all Alembic migrations once per test session, roll them back at the end."""
    cfg = alembic_config()
    command.downgrade(cfg, "base")  # start from a clean schema even after an aborted run
    command.upgrade(cfg, "head")
    yield
    get_engine().dispose()
    command.downgrade(cfg, "base")


@pytest.fixture(autouse=True)
def clean_tables() -> Iterator[None]:
    """Every test starts with only the Inbox project and no tasks or labels."""
    yield
    with get_engine().begin() as conn:
        conn.execute(text("TRUNCATE TABLE task_labels, tasks, labels RESTART IDENTITY CASCADE"))
        conn.execute(text("DELETE FROM projects WHERE NOT is_inbox"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def inbox_id(client: TestClient) -> int:
    return next(p["id"] for p in client.get("/api/projects").json() if p["is_inbox"])
