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


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> Iterator[None]:
    """Apply all Alembic migrations once per test session, roll them back at the end."""
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")
    yield
    get_engine().dispose()
    command.downgrade(cfg, "base")


@pytest.fixture(autouse=True)
def clean_tables() -> Iterator[None]:
    """Give every test an empty tasks table."""
    yield
    with get_engine().begin() as conn:
        conn.execute(text("TRUNCATE TABLE tasks RESTART IDENTITY"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
