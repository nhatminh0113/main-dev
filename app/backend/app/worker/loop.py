"""The worker main loop: claim a job, run its handler outside any transaction, record the outcome.

The loop never crashes on runtime errors: database problems and unexpected exceptions are logged
and followed by an exponential backoff. A running handler is never interrupted, so a stop request
(SIGTERM) lets the current job finish.
"""

import logging
import threading
import time
from collections.abc import Callable
from typing import Any

from sqlalchemy import Connection, Engine
from sqlalchemy.exc import ProgrammingError, SQLAlchemyError

from app import jobs
from app.exporter import run_export
from app.worker.metrics import JOB_DURATION, JOBS

logger = logging.getLogger("taskapp.worker")

Handler = Callable[[dict[str, Any]], str]

HANDLERS: dict[str, Handler] = {"export_tasks": run_export}

MAINTENANCE_INTERVAL = 60.0  # seconds between reclaim_stuck / delete_expired runs
HEARTBEAT_STALE_SECONDS = 120.0  # four times the maximum backoff
MAX_BACKOFF_SECONDS = 30.0
STUCK_AFTER_SECONDS = jobs.STUCK_AFTER.total_seconds()


class Worker:
    def __init__(
        self,
        engine: Engine,
        handlers: dict[str, Handler],
        poll_interval: float,
        stop_event: threading.Event,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._engine = engine
        self._handlers = handlers
        self.poll_interval = poll_interval
        self.stop_event = stop_event
        self._clock = clock
        # Read by the health server threads; written only by the loop thread.
        self.last_heartbeat = clock()
        self.current_job_started: float | None = None
        self.schema_is_ready = False
        self._failures = 0
        self._next_maintenance = clock()  # first iteration runs maintenance

    # ---------- public API ----------

    def run(self) -> None:
        while not self.stop_event.is_set():
            self.step()

    def step(self) -> None:
        """One loop iteration, including its idle or backoff wait."""
        self.last_heartbeat = self._clock()
        try:
            delay = self._iterate()
        except SQLAlchemyError as exc:
            if isinstance(exc, ProgrammingError):  # e.g. table missing after a downgrade
                self.schema_is_ready = False
            self._failures += 1
            delay = self.backoff_delay()
            logger.warning(
                "database unavailable",
                extra={"error_type": type(exc).__name__, "retry_in": delay},
            )
        except Exception:
            self._failures += 1
            delay = self.backoff_delay()
            logger.error(
                "unexpected error in worker loop", exc_info=True, extra={"retry_in": delay}
            )
        self.last_heartbeat = self._clock()
        if delay > 0:
            self.stop_event.wait(delay)

    def backoff_delay(self) -> float:
        return min(self.poll_interval * 2 ** (self._failures - 1), MAX_BACKOFF_SECONDS)

    def is_alive(self) -> bool:
        """Liveness: a job may run up to STUCK_AFTER, otherwise the heartbeat must be recent."""
        now = self._clock()
        started = self.current_job_started
        if started is not None:
            return now - started <= STUCK_AFTER_SECONDS
        return now - self.last_heartbeat <= HEARTBEAT_STALE_SECONDS

    # ---------- loop body ----------

    def _iterate(self) -> float:
        """Returns the number of seconds to wait before the next iteration."""
        if not self.schema_is_ready:
            with self._engine.connect() as conn:
                ready = jobs.schema_ready(conn)
            if not ready:
                self._failures += 1
                delay = self.backoff_delay()
                logger.warning("database schema not ready", extra={"retry_in": delay})
                return delay
            self.schema_is_ready = True
            logger.info("database schema ready")

        if self._clock() >= self._next_maintenance:
            self._maintenance()
            self._next_maintenance = self._clock() + MAINTENANCE_INTERVAL

        with self._engine.begin() as conn:
            job = jobs.claim_next(conn)
        self._failures = 0  # the claim worked; later errors in this iteration still count
        if job is None:
            return self.poll_interval
        outcome_written = self._process(job)
        return 0.0 if outcome_written else self.backoff_delay()

    def _maintenance(self) -> None:
        with self._engine.begin() as conn:
            requeued, failed = jobs.reclaim_stuck(conn)
        if requeued or failed:
            logger.warning(
                "reclaimed stuck jobs: %d requeued, %d failed",
                requeued,
                failed,
                extra={"count": requeued + failed},
            )
        with self._engine.begin() as conn:
            deleted = jobs.delete_expired(conn)
        if deleted:
            logger.info("deleted expired jobs", extra={"count": deleted})

    def _process(self, job: jobs.ClaimedJob) -> bool:
        """Run one claimed job. False if its outcome could not be written (DB error)."""
        self.current_job_started = self._clock()
        self.last_heartbeat = self.current_job_started
        try:
            return self._run_job(job)
        finally:
            self.current_job_started = None
            self.last_heartbeat = self._clock()

    def _run_job(self, job: jobs.ClaimedJob) -> bool:
        extra: dict[str, Any] = {"job_id": job.id, "job_type": job.type, "attempts": job.attempts}
        handler = self._handlers.get(job.type)
        if handler is None:
            outcome = self._write(
                job, lambda conn: jobs.fail(conn, job, "unknown job type", retryable=False)
            )
            if outcome is None:
                return False
            if outcome == "lost":
                self._lease_lost(job, extra)
            else:
                JOBS.labels(job.type, "failed").inc()
                logger.error("unknown job type", extra={**extra, "job_status": "failed"})
            return True

        started = time.perf_counter()
        try:
            result = handler(job.payload)
        except Exception as exc:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            # Only the exception class is stored: the message may contain SQL or user data.
            error = type(exc).__name__
            outcome = self._write(job, lambda conn: jobs.fail(conn, job, error, retryable=True))
            if outcome is None:
                return False
            if outcome == "lost":
                self._lease_lost(job, extra)
                return True
            JOBS.labels(job.type, outcome).inc()
            log_extra = {**extra, "job_status": outcome, "duration_ms": duration_ms}
            if outcome == "retry":
                logger.warning("job failed, will retry", exc_info=True, extra=log_extra)
            else:
                logger.error("job failed permanently", exc_info=True, extra=log_extra)
            return True

        duration = time.perf_counter() - started
        stored = self._write(job, lambda conn: jobs.complete(conn, job, result))
        if stored is None:
            return False
        if not stored:
            self._lease_lost(job, extra)
            return True
        JOBS.labels(job.type, "done").inc()
        JOB_DURATION.labels(job.type).observe(duration)
        logger.info(
            "job finished",
            extra={**extra, "job_status": "done", "duration_ms": round(duration * 1000, 2)},
        )
        return True

    def _write[T](self, job: jobs.ClaimedJob, write: Callable[[Connection], T]) -> T | None:
        """Record a job outcome in its own transaction. None if the database failed.

        The job then stays `running` and is reclaimed after STUCK_AFTER (at-least-once).
        """
        try:
            with self._engine.begin() as conn:
                return write(conn)
        except SQLAlchemyError as exc:
            if isinstance(exc, ProgrammingError):
                self.schema_is_ready = False
            self._failures += 1
            logger.error(
                "cannot record job outcome",
                extra={"job_id": job.id, "job_type": job.type, "error_type": type(exc).__name__},
            )
            return None

    @staticmethod
    def _lease_lost(job: jobs.ClaimedJob, extra: dict[str, Any]) -> None:
        JOBS.labels(job.type, "lost").inc()
        logger.warning("job lease lost, result discarded", extra={**extra, "job_status": "lost"})
