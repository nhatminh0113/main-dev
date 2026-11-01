"""Worker HTTP endpoints (stdlib server): /healthz, /readyz, /metrics.

Named health_server rather than http so it never shadows the stdlib `http` package.
"""

import json
import logging
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from prometheus_client import CONTENT_TYPE_LATEST, REGISTRY, generate_latest
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from app import jobs
from app.worker.loop import Worker
from app.worker.metrics import QUEUE_DEPTH

logger = logging.getLogger("taskapp.worker.http")


def make_handler(worker: Worker, engine: Engine) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "taskapp-worker"
        sys_version = ""

        def do_GET(self) -> None:  # noqa: N802 - name required by BaseHTTPRequestHandler
            path = self.path.split("?", 1)[0]
            if path == "/healthz":
                if worker.is_alive():
                    self._send_json(200, {"status": "ok"})
                else:
                    self._send_json(503, {"status": "stale"})
            elif path == "/readyz":
                if _database_ready(engine):
                    self._send_json(200, {"status": "ready"})
                else:
                    self._send_json(503, {"status": "unavailable"})
            elif path == "/metrics":
                _refresh_queue_depth(engine)
                self._send(200, generate_latest(REGISTRY), CONTENT_TYPE_LATEST)
            else:
                self._send_json(404, {"detail": "not found"})

        def log_message(self, format: str, *args: Any) -> None:
            # Keep the stdlib's plain-text stderr lines out of the JSON log stream.
            logger.debug(format, *args)

        def _send_json(self, code: int, body: dict[str, str]) -> None:
            self._send(code, json.dumps(body).encode(), "application/json")

        def _send(self, code: int, body: bytes, content_type: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def _database_ready(engine: Engine) -> bool:
    """The database answers and the schema exists. Never exposes connection details."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            return jobs.schema_ready(conn)
    except SQLAlchemyError as exc:
        logger.debug("readiness check failed", extra={"error_type": type(exc).__name__})
        return False


def _refresh_queue_depth(engine: Engine) -> None:
    """Set the gauge at scrape time, so it is current even while the loop is busy with jobs.

    On a database error the previous value is kept and the scrape still succeeds.
    """
    try:
        with engine.connect() as conn:
            QUEUE_DEPTH.set(jobs.queue_depth(conn))
    except SQLAlchemyError as exc:
        logger.debug("queue depth unavailable", extra={"error_type": type(exc).__name__})


ALL_INTERFACES = "0.0.0.0"  # noqa: S104 - container port, reached by kubelet probes and Prometheus


def start_server(
    worker: Worker, engine: Engine, port: int, host: str = ALL_INTERFACES
) -> ThreadingHTTPServer:
    """Bind and serve in a daemon thread. Raises OSError if the port cannot be bound."""
    server = ThreadingHTTPServer((host, port), make_handler(worker, engine))
    thread = threading.Thread(target=server.serve_forever, name="health-server", daemon=True)
    thread.start()
    return server
