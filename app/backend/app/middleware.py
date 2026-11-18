"""Request context: X-Request-ID and the access log line (replaces uvicorn's access log).

Pure ASGI rather than BaseHTTPMiddleware, which breaks contextvars and streaming responses.
"""

import logging
import re
import time
import uuid
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.logging_setup import request_id_var

access_logger = logging.getLogger("taskapp.access")

REQUEST_ID_HEADER = b"x-request-id"
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
# Probes and scrapes run every few seconds; keep them out of INFO logs.
QUIET_PATHS = frozenset({"/api/healthz", "/api/readyz", "/metrics"})


def _incoming_request_id(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == REQUEST_ID_HEADER:
            candidate = value.decode("latin-1")
            return candidate if _VALID_REQUEST_ID.fullmatch(candidate) else None
    return None


def _log_access(scope: Scope, status: int, started: float, level: int) -> None:
    method = scope.get("method", "")
    path = scope.get("path", "")
    extra: dict[str, Any] = {
        "method": method,
        "path": path,  # never the query string
        "status": status,
        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        "request_id": request_id_var.get(),
    }
    access_logger.log(level, "%s %s %s", method, path, status, extra=extra)


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _incoming_request_id(scope) or str(uuid.uuid4())
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status = 500

        async def send_with_request_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = [*message.get("headers", []), (REQUEST_ID_HEADER, request_id.encode())]
                message = {**message, "headers": headers}
            await send(message)

        try:
            try:
                await self.app(scope, receive, send_with_request_id)
            except Exception:
                # No traceback here: uvicorn.error (or the test client) reports it once.
                _log_access(scope, 500, started, logging.ERROR)
                raise
            level = logging.DEBUG if scope.get("path") in QUIET_PATHS else logging.INFO
            _log_access(scope, status, started, level)
        finally:
            request_id_var.reset(token)
