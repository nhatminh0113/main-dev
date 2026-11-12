"""Structured JSON logging, request ids and the access log middleware."""

import json
import logging
import re
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import text

from app.config import LoggingSettings
from app.db import get_engine
from app.logging_setup import JsonFormatter, configure_logging
from app.middleware import RequestContextMiddleware

TS_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


@pytest.fixture(autouse=True)
def default_logging() -> Iterator[None]:
    """Every test starts and ends with the default configuration (JSON, INFO)."""
    configure_logging(LoggingSettings(log_format="json", log_level="INFO"))
    yield
    configure_logging(LoggingSettings(log_format="json", log_level="INFO"))


def json_lines(out: str) -> list[dict[str, Any]]:
    """Every non-empty stdout line must be one JSON object."""
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def access_lines(out: str, path: str) -> list[dict[str, Any]]:
    return [e for e in json_lines(out) if e["logger"] == "taskapp.access" and e["path"] == path]


def test_json_formatter_fields_and_utc_ts() -> None:
    record = logging.makeLogRecord(
        {
            "name": "taskapp.test",
            "levelno": logging.INFO,
            "levelname": "INFO",
            "msg": "hello %s",
            "args": ("world",),
            "created": 1_700_000_000.123,
            "msecs": 123.0,
            "job_id": 7,
            "duration_ms": 1.5,
            "not_allowlisted": "leak",
        }
    )
    entry = json.loads(JsonFormatter().format(record))
    assert entry == {
        "ts": "2023-11-14T22:13:20.123Z",
        "level": "INFO",
        "logger": "taskapp.test",
        "message": "hello world",
        "job_id": 7,
        "duration_ms": 1.5,
    }
    assert TS_PATTERN.match(entry["ts"])


def test_text_format_selected_by_env(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("LOG_FORMAT", "text")
    monkeypatch.setenv("LOG_LEVEL", "warning")
    configure_logging()
    logging.getLogger("taskapp.test").info("hidden at warning")
    logging.getLogger("taskapp.test").warning("plain line")
    out = capsys.readouterr().out
    assert "hidden at warning" not in out
    (line,) = out.splitlines()
    assert line.endswith("WARNING taskapp.test plain line")
    with pytest.raises(json.JSONDecodeError):
        json.loads(line)


def test_invalid_log_level_rejected() -> None:
    assert LoggingSettings(log_level=" debug ").log_level == "DEBUG"
    with pytest.raises(ValidationError, match="log_level"):
        LoggingSettings(log_level="verbose")
    with pytest.raises(ValidationError, match="log_format"):
        LoggingSettings(log_format="xml")


def test_access_log_line_has_request_fields(
    client: TestClient, capsys: pytest.CaptureFixture[str]
) -> None:
    capsys.readouterr()
    response = client.get("/api/tasks", params={"q": "secret-query"})
    assert response.status_code == 200
    out = capsys.readouterr().out
    (line,) = access_lines(out, "/api/tasks")
    assert line["level"] == "INFO"
    assert line["message"] == "GET /api/tasks 200"
    assert line["method"] == "GET"
    assert line["status"] == 200
    assert isinstance(line["duration_ms"], int | float)
    assert line["request_id"] == response.headers["x-request-id"]
    assert TS_PATTERN.match(line["ts"])
    # The path is logged without the query string (the test client's own httpx line has it).
    app_lines = [e for e in json_lines(out) if not e["logger"].startswith("httpx")]
    assert "secret-query" not in json.dumps(app_lines)


def test_probe_paths_logged_at_debug_only(
    client: TestClient, capsys: pytest.CaptureFixture[str]
) -> None:
    capsys.readouterr()
    for path in ("/api/healthz", "/api/readyz", "/metrics"):
        assert client.get(path).status_code == 200
    out = capsys.readouterr().out
    assert not any(access_lines(out, p) for p in ("/api/healthz", "/api/readyz", "/metrics"))

    configure_logging(LoggingSettings(log_level="DEBUG"))
    client.get("/api/healthz")
    (line,) = access_lines(capsys.readouterr().out, "/api/healthz")
    assert line["level"] == "DEBUG"
    assert line["status"] == 200


def test_valid_request_id_echoed_and_logged(
    client: TestClient, capsys: pytest.CaptureFixture[str]
) -> None:
    capsys.readouterr()
    response = client.get("/api/tasks", headers={"X-Request-ID": "smoke-1.A_b"})
    assert response.headers["x-request-id"] == "smoke-1.A_b"
    (line,) = access_lines(capsys.readouterr().out, "/api/tasks")
    assert line["request_id"] == "smoke-1.A_b"


@pytest.mark.parametrize("bad_id", ["x" * 65, "has space", "<script>", ""])
def test_invalid_request_id_replaced_with_uuid(client: TestClient, bad_id: str) -> None:
    response = client.get("/api/healthz", headers={"X-Request-ID": bad_id})
    echoed = response.headers["x-request-id"]
    assert echoed != bad_id
    assert uuid.UUID(echoed).version == 4


def test_generated_request_id_when_missing(client: TestClient) -> None:
    first = client.get("/api/healthz").headers["x-request-id"]
    second = client.get("/api/healthz").headers["x-request-id"]
    assert uuid.UUID(first).version == 4
    assert first != second


def test_request_id_attached_to_logs_inside_request(
    client: TestClient, capsys: pytest.CaptureFixture[str]
) -> None:
    capsys.readouterr()
    response = client.patch(
        "/api/features/week_view", json={"enabled": False}, headers={"X-Request-ID": "ctx-42"}
    )
    assert response.status_code == 200
    (line,) = [
        e for e in json_lines(capsys.readouterr().out) if e["message"] == "feature flag changed"
    ]
    assert line["request_id"] == "ctx-42"
    assert line["flag_key"] == "week_view"
    assert line["enabled"] is False


def test_no_secrets_in_logs(client: TestClient, capsys: pytest.CaptureFixture[str]) -> None:
    capsys.readouterr()
    client.get("/api/tasks", headers={"Authorization": "Basic dXNlcjpzM2NyZXQtcGFzcw=="})
    log = logging.getLogger("taskapp.test")
    log.warning("cannot reach postgresql+psycopg://taskapp:hunter2-pw@db:5432/taskapp")
    try:
        raise RuntimeError("connect to postgresql://admin:hunter2-pw@db/x failed")
    except RuntimeError:
        log.exception("engine error")
    out = capsys.readouterr().out
    json_lines(out)
    assert "hunter2-pw" not in out
    assert "dXNlcjpzM2NyZXQtcGFzcw" not in out
    assert "://***:***@db" in out


def test_unhandled_exception_logged_as_500(capsys: pytest.CaptureFixture[str]) -> None:
    test_app = FastAPI()

    @test_app.get("/boom")
    def boom() -> None:
        raise RuntimeError("kaboom")

    test_app.add_middleware(RequestContextMiddleware)
    capsys.readouterr()
    with TestClient(test_app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/boom")
    assert response.status_code == 500
    (line,) = access_lines(capsys.readouterr().out, "/boom")
    assert line["status"] == 500
    assert line["level"] == "ERROR"
    assert "exc" not in line  # the traceback is reported once, by the server


def test_sqlalchemy_statements_not_logged_at_info(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(LoggingSettings(log_level="DEBUG"))
    assert logging.getLogger("sqlalchemy").level == logging.WARNING
    capsys.readouterr()
    with get_engine().connect() as conn:
        assert conn.execute(text("SELECT 'sql-marker-42'")).scalar_one() == "sql-marker-42"
    assert "sql-marker-42" not in capsys.readouterr().out


def test_configure_logging_is_idempotent() -> None:
    configure_logging()
    configure_logging()
    root = logging.getLogger()
    ours = [h for h in root.handlers if getattr(h, "_taskapp", False)]
    assert len(ours) == 1
    for name in ("uvicorn", "uvicorn.error"):
        assert logging.getLogger(name).handlers == []
        assert logging.getLogger(name).propagate is True


def test_uvicorn_access_log_stays_disabled() -> None:
    """uvicorn writes its own access line iff `uvicorn.access` has a reachable handler."""
    access = logging.getLogger("uvicorn.access")
    access.addHandler(logging.NullHandler())  # as uvicorn's dictConfig would
    access.propagate = True
    configure_logging()
    assert access.hasHandlers() is False
