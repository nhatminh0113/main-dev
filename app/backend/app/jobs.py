"""Job queue operations on the `jobs` table (PostgreSQL, no broker).

Every function takes a Core `Connection`; the caller owns the transaction (`engine.begin()`).
State transitions are guarded UPDATEs: a running job belongs to whoever claimed it with a given
`attempts` value, so a late result from a worker that lost its lease is discarded.
"""

from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Literal

from sqlalchemy import ColumnElement, Connection, case, delete, func, insert, select, text, update

from app.models import JOB_ERROR_MAX, Job

MAX_ATTEMPTS = 3
STUCK_AFTER = timedelta(minutes=10)
RESULT_TTL = timedelta(hours=24)

jobs = Job.__table__

FailOutcome = Literal["retry", "failed", "lost"]


@dataclass(frozen=True)
class ClaimedJob:
    id: int
    type: str
    payload: dict[str, Any]
    attempts: int


def _owned(job: ClaimedJob) -> tuple[ColumnElement[bool], ...]:
    return (jobs.c.id == job.id, jobs.c.status == "running", jobs.c.attempts == job.attempts)


def enqueue(conn: Connection, type: str, payload: dict[str, Any]) -> int:
    stmt = insert(jobs).values(type=type, payload=payload).returning(jobs.c.id)
    return conn.execute(stmt).scalar_one()


def claim_next(conn: Connection) -> ClaimedJob | None:
    """Take the oldest queued job. Rows locked by another claimer are skipped, not waited for."""
    next_id = (
        select(jobs.c.id)
        .where(jobs.c.status == "queued")
        .order_by(jobs.c.id)
        .limit(1)
        .with_for_update(skip_locked=True)
        .scalar_subquery()
    )
    stmt = (
        update(jobs)
        .where(jobs.c.id == next_id, jobs.c.status == "queued")
        .values(status="running", attempts=jobs.c.attempts + 1, started_at=func.now(), error=None)
        .returning(jobs.c.id, jobs.c.type, jobs.c.payload, jobs.c.attempts)
    )
    row = conn.execute(stmt).first()
    if row is None:
        return None
    return ClaimedJob(id=row.id, type=row.type, payload=row.payload, attempts=row.attempts)


def complete(conn: Connection, job: ClaimedJob, result: str) -> bool:
    """Store the result. False means the lease was lost and nothing was written."""
    stmt = (
        update(jobs)
        .where(*_owned(job))
        .values(
            status="done",
            result=result,
            error=None,
            finished_at=func.now(),
            expires_at=func.now() + RESULT_TTL,
        )
    )
    return conn.execute(stmt).rowcount == 1


def fail(conn: Connection, job: ClaimedJob, error: str, retryable: bool) -> FailOutcome:
    """Requeue the job (retry) or mark it failed for good; "lost" if the lease was lost."""
    error = error[:JOB_ERROR_MAX]
    if retryable and job.attempts < MAX_ATTEMPTS:
        outcome: FailOutcome = "retry"
        values: dict[str, Any] = {"status": "queued", "started_at": None, "error": error}
    else:
        outcome = "failed"
        values = {
            "status": "failed",
            "error": error,
            "finished_at": func.now(),
            "expires_at": func.now() + RESULT_TTL,
        }
    updated = conn.execute(update(jobs).where(*_owned(job)).values(**values)).rowcount
    return outcome if updated == 1 else "lost"


def reclaim_stuck(conn: Connection) -> tuple[int, int]:
    """Requeue jobs running longer than STUCK_AFTER, or fail them once attempts are used up.

    Returns (requeued, failed).
    """
    exhausted = jobs.c.attempts >= MAX_ATTEMPTS
    stmt = (
        update(jobs)
        .where(jobs.c.status == "running", jobs.c.started_at < func.now() - STUCK_AFTER)
        .values(
            status=case((exhausted, "failed"), else_="queued"),
            error="timed out",
            started_at=case((exhausted, jobs.c.started_at), else_=None),
            finished_at=case((exhausted, func.now()), else_=jobs.c.finished_at),
            expires_at=case((exhausted, func.now() + RESULT_TTL), else_=jobs.c.expires_at),
        )
        .returning(jobs.c.status)
    )
    statuses = conn.execute(stmt).scalars().all()
    return statuses.count("queued"), statuses.count("failed")


def delete_expired(conn: Connection) -> int:
    stmt = delete(jobs).where(jobs.c.expires_at < func.now(), jobs.c.status != "running")
    return conn.execute(stmt).rowcount


def queue_depth(conn: Connection) -> int:
    stmt = select(func.count()).select_from(jobs).where(jobs.c.status == "queued")
    return conn.execute(stmt).scalar_one()


def active_count(conn: Connection, type: str) -> int:
    """Queued or running jobs of a type that have not expired (used for the 429 cap)."""
    stmt = (
        select(func.count())
        .select_from(jobs)
        .where(
            jobs.c.type == type,
            jobs.c.status.in_(("queued", "running")),
            jobs.c.expires_at > func.now(),
        )
    )
    return conn.execute(stmt).scalar_one()


def schema_ready(conn: Connection) -> bool:
    return bool(conn.execute(text("SELECT to_regclass('public.jobs') IS NOT NULL")).scalar_one())
