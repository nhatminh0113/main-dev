"""Structured logging shared by the API, Alembic and the worker.

One line per record on stdout. JSON by default (LOG_FORMAT=json), plain text for local debugging
(LOG_FORMAT=text). Only an allowlist of `extra=` fields is emitted, so arbitrary record attributes
never leak into the output.
"""

import json
import logging
import re
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any, TextIO

from app.config import LoggingSettings

# Set by RequestContextMiddleware for the duration of a request.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

EXTRA_FIELDS = (
    "request_id",
    "method",
    "path",
    "status",
    "duration_ms",
    "job_id",
    "job_type",
    "job_status",
    "attempts",
    "flag_key",
    "enabled",
    "count",
    "retry_in",
    "error_type",
    "poll_interval",
    "http_port",
    "signal",
    "fields",
)

TEXT_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"

# Loggers configured by uvicorn's own dictConfig before the app is imported.
UVICORN_LOGGERS = ("uvicorn", "uvicorn.error")
# uvicorn writes its access line whenever this logger has a reachable handler
# (`hasHandlers()`), even with --no-access-log; RequestContextMiddleware writes it instead.
UVICORN_ACCESS_LOGGER = "uvicorn.access"

_CREDENTIALS_IN_URL = re.compile(r"(://[^:/@\s]+):[^@\s]+@")


def redact(text: str) -> str:
    """Hide `user:password@` in URLs (defence in depth: the app never logs DATABASE_URL)."""
    return _CREDENTIALS_IN_URL.sub("://***:***@", text)


def _utc_timestamp(record: logging.LogRecord) -> str:
    moment = datetime.fromtimestamp(record.created, UTC)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(record.msecs):03d}Z"


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "ts": _utc_timestamp(record),
            "level": record.levelname,
            "logger": record.name,
            "message": redact(record.getMessage()),
        }
        for name in EXTRA_FIELDS:
            if name in record.__dict__:
                entry[name] = record.__dict__[name]
        if "request_id" not in entry and (request_id := request_id_var.get()) is not None:
            entry["request_id"] = request_id
        if record.exc_info:
            entry["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(entry, ensure_ascii=False, default=str)


class TextFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__(TEXT_FORMAT)

    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


class _StdoutHandler(logging.StreamHandler):
    """Writes to whatever `sys.stdout` is at emit time (works with pytest's capsys)."""

    _taskapp = True

    def __init__(self) -> None:
        logging.Handler.__init__(self)

    @property
    def stream(self) -> TextIO:
        return sys.stdout

    @stream.setter
    def stream(self, value: TextIO) -> None:  # StreamHandler API; the stream is always stdout
        pass


def configure_logging(settings: LoggingSettings | None = None) -> None:
    """Install the stdout handler on the root logger. Safe to call more than once."""
    settings = settings or LoggingSettings()
    root = logging.getLogger()
    for handler in list(root.handlers):
        if getattr(handler, "_taskapp", False):
            root.removeHandler(handler)

    handler = _StdoutHandler()
    handler.setFormatter(JsonFormatter() if settings.log_format == "json" else TextFormatter())
    root.addHandler(handler)
    root.setLevel(settings.log_level)

    # uvicorn installs its own handlers; route its messages through the root handler instead.
    for name in UVICORN_LOGGERS:
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True
        uvicorn_logger.setLevel(logging.NOTSET)
    # Its access log stays off (no handler, no propagation): one access line per request.
    access_logger = logging.getLogger(UVICORN_ACCESS_LOGGER)
    access_logger.handlers.clear()
    access_logger.propagate = False

    # Guard: LOG_LEVEL=DEBUG must not turn on SQL statement logging.
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
