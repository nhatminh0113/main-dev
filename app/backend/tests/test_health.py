from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_db
from app.main import app

# Nothing listens on port 1, so connecting fails immediately.
UNREACHABLE_DB_URL = "postgresql+psycopg://nobody:nothing@127.0.0.1:1/none?connect_timeout=2"


def _unreachable_db() -> Iterator[Session]:
    engine = create_engine(UNREACHABLE_DB_URL)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def test_healthz_returns_ok(client: TestClient) -> None:
    response = client.get("/api/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_healthz_does_not_depend_on_database(client: TestClient) -> None:
    app.dependency_overrides[get_db] = _unreachable_db

    response = client.get("/api/healthz")

    assert response.status_code == 200


def test_readyz_returns_ready_when_database_is_reachable(client: TestClient) -> None:
    response = client.get("/api/readyz")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_readyz_returns_503_when_database_is_unreachable(client: TestClient) -> None:
    app.dependency_overrides[get_db] = _unreachable_db

    response = client.get("/api/readyz")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


def test_metrics_exposes_prometheus_http_metrics(client: TestClient) -> None:
    client.get("/api/tasks")

    response = client.get("/metrics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert "http_requests_total" in response.text
    assert 'handler="/api/tasks"' in response.text


def test_metrics_is_not_listed_in_openapi_schema(client: TestClient) -> None:
    paths = client.get("/api/openapi.json").json()["paths"]

    assert "/metrics" not in paths
