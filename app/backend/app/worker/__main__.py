"""Entry point: python -m app.worker

Signals are received synchronously with sigwait on the main thread; no Python signal handler is
installed, so nothing runs in an asynchronous signal context. The loop runs on its own thread
and finishes the current job before the process exits.
"""

import logging
import os
import signal
import sys
import threading

from pydantic import ValidationError

from app.config import get_settings
from app.db import get_engine
from app.logging_setup import configure_logging
from app.worker.health_server import start_server
from app.worker.loop import HANDLERS, Worker

logger = logging.getLogger("taskapp.worker")

SHUTDOWN_SIGNALS = {signal.SIGTERM, signal.SIGINT}


def main() -> int:  # pragma: no cover - exercised by the subprocess test (not measured)
    configure_logging()
    try:
        settings = get_settings()
        engine = get_engine()
    except ValidationError as exc:
        # Never str(exc): pydantic includes the input value, which may be the database URL.
        fields = [".".join(map(str, error["loc"])) for error in exc.errors()]
        logger.critical("invalid worker settings", extra={"fields": fields})
        return 1
    except Exception as exc:
        logger.critical("cannot create database engine", extra={"error_type": type(exc).__name__})
        return 1

    # Block the shutdown signals before any thread exists: every thread inherits the mask,
    # so the signals stay pending until sigwait() below collects them.
    signal.pthread_sigmask(signal.SIG_BLOCK, SHUTDOWN_SIGNALS)
    stop_event = threading.Event()
    worker = Worker(engine, HANDLERS, settings.worker_poll_interval, stop_event)

    try:
        server = start_server(worker, engine, settings.worker_http_port)
    except OSError as exc:
        logger.critical(
            "cannot start health server",
            extra={"http_port": settings.worker_http_port, "error_type": type(exc).__name__},
        )
        return 1
    logger.info(
        "worker started",
        extra={
            "poll_interval": settings.worker_poll_interval,
            "http_port": settings.worker_http_port,
        },
    )

    loop_failed = threading.Event()

    def _run_loop() -> None:
        try:
            worker.run()
        finally:
            if not stop_event.is_set():
                loop_failed.set()
                logger.error("worker loop exited unexpectedly")
                os.kill(os.getpid(), signal.SIGTERM)  # wakes sigwait (the signal is blocked)

    worker_thread = threading.Thread(target=_run_loop, name="worker-loop")
    worker_thread.start()

    signum = signal.sigwait(SHUTDOWN_SIGNALS)
    logger.info("shutdown requested", extra={"signal": signal.Signals(signum).name})
    stop_event.set()
    worker_thread.join()  # the current job, if any, finishes first

    server.shutdown()
    server.server_close()
    get_engine().dispose()
    logger.info("worker stopped")
    return 1 if loop_failed.is_set() else 0


if __name__ == "__main__":
    sys.exit(main())
