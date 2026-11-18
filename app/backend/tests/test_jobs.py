"""Queue operations on the jobs table: claim, retry, reclaim, lease guard, cleanup."""

import threading
from datetime import timedelta

import pytest
from prometheus_client import REGISTRY
from sqlalchemy import Engine, text

from app import jobs
from app.db import get_engine
from tests.helpers import age_running, claim_job, enqueue_job, get_job, make_worker, run_worker_once


@pytest.fixture
def engine() -> Engine:
    return get_engine()


def test_claim_returns_oldest_queued_and_marks_running() -> None:
    first = enqueue_job(payload={"n": 1})
    second = enqueue_job()

    job = claim_job()
    assert job == jobs.ClaimedJob(id=first, type="test_job", payload={"n": 1}, attempts=1)
    row = get_job(first)
    assert row["status"] == "running"
    assert row["attempts"] == 1
    assert row["started_at"] is not None

    assert claim_job().id == second
    assert claim_job() is None


def test_claim_skips_rows_locked_by_another_transaction(engine: Engine) -> None:
    first = enqueue_job()
    second = enqueue_job()
    holder = engine.connect()
    try:
        holder.begin()
        assert jobs.claim_next(holder).id == first  # row lock held until the transaction ends
        with engine.begin() as conn:
            # Without SKIP LOCKED this claim would wait for `holder` and hit the lock timeout.
            conn.execute(text("SET LOCAL lock_timeout = '1s'"))
            assert jobs.claim_next(conn).id == second
    finally:
        holder.rollback()
        holder.close()
    assert get_job(first)["status"] == "queued"  # rolled back


def test_concurrent_claimers_never_share_a_job(engine: Engine) -> None:
    all_ids = [enqueue_job() for _ in range(30)]
    claimed: list[list[int]] = [[] for _ in range(4)]
    errors: list[BaseException] = []
    start = threading.Barrier(4)

    def claimer(slot: int) -> None:
        try:
            start.wait()
            while True:
                job = claim_job()  # each call checks out its own pooled connection
                if job is None:
                    return
                with engine.begin() as conn:
                    assert jobs.complete(conn, job, "ok")
                claimed[slot].append(job.id)
        except BaseException as exc:  # surfaced in the main thread below
            errors.append(exc)

    threads = [threading.Thread(target=claimer, args=(i,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    assert not errors, errors
    union = [job_id for ids in claimed for job_id in ids]
    assert len(union) == len(set(union)), "a job was claimed twice"
    assert sorted(union) == all_ids
    with engine.connect() as conn:
        statuses = conn.execute(text("SELECT DISTINCT status, attempts FROM jobs")).all()
    assert [tuple(s) for s in statuses] == [("done", 1)]


def test_retry_then_success_counts_attempts(engine: Engine) -> None:
    job_id = enqueue_job()
    for attempt in (1, 2):
        job = claim_job()
        assert job.attempts == attempt
        with engine.begin() as conn:
            assert jobs.fail(conn, job, "ValueError", retryable=True) == "retry"
        row = get_job(job_id)
        assert (row["status"], row["started_at"], row["error"]) == ("queued", None, "ValueError")

    job = claim_job()
    assert job.attempts == 3
    with engine.begin() as conn:
        assert jobs.complete(conn, job, "csv")
    row = get_job(job_id)
    assert (row["status"], row["attempts"], row["result"], row["error"]) == ("done", 3, "csv", None)


def test_three_failures_mark_failed(engine: Engine) -> None:
    job_id = enqueue_job()
    outcomes = []
    for _ in range(3):
        job = claim_job()
        with engine.begin() as conn:
            outcomes.append(jobs.fail(conn, job, "x" * 600, retryable=True))
    assert outcomes == ["retry", "retry", "failed"]
    row = get_job(job_id)
    assert (row["status"], row["attempts"]) == ("failed", 3)
    assert row["finished_at"] is not None
    assert len(row["error"]) == 500  # truncated to the column size
    assert claim_job() is None


def test_unknown_type_fails_without_retry() -> None:
    job_type = "unknown_type_case6"
    labels = {"type": job_type, "status": "failed"}
    before = REGISTRY.get_sample_value("taskapp_worker_jobs_total", labels) or 0
    job_id = enqueue_job(job_type)
    run_worker_once(make_worker(handlers={}))
    row = get_job(job_id)
    assert (row["status"], row["attempts"], row["error"]) == ("failed", 1, "unknown job type")
    assert REGISTRY.get_sample_value("taskapp_worker_jobs_total", labels) == before + 1


def test_fail_after_reclaim_returns_lost(engine: Engine) -> None:
    job_id = enqueue_job()
    old = claim_job()
    age_running(job_id)
    with engine.begin() as conn:
        assert jobs.reclaim_stuck(conn) == (1, 0)
    before = get_job(job_id)
    with engine.begin() as conn:
        assert jobs.fail(conn, old, "ValueError", retryable=True) == "lost"
    assert get_job(job_id) == before  # unchanged


def test_reclaim_requeues_stuck_job(engine: Engine) -> None:
    job_id = enqueue_job()
    claim_job()
    age_running(job_id)
    with engine.begin() as conn:
        assert jobs.reclaim_stuck(conn) == (1, 0)
    row = get_job(job_id)
    assert (row["status"], row["attempts"], row["error"]) == ("queued", 1, "timed out")
    assert row["started_at"] is None
    assert row["finished_at"] is None
    assert claim_job().attempts == 2


def test_reclaim_fails_stuck_job_after_max_attempts(engine: Engine) -> None:
    job_id = enqueue_job()
    for _ in range(2):
        job = claim_job()
        with engine.begin() as conn:
            jobs.fail(conn, job, "ValueError", retryable=True)
    assert claim_job().attempts == jobs.MAX_ATTEMPTS
    age_running(job_id)
    with engine.begin() as conn:
        assert jobs.reclaim_stuck(conn) == (0, 1)
        expiry_left = conn.execute(
            text("SELECT expires_at - now() FROM jobs WHERE id = :id"), {"id": job_id}
        ).scalar_one()
    row = get_job(job_id)
    assert (row["status"], row["error"]) == ("failed", "timed out")
    assert row["finished_at"] is not None
    assert expiry_left > timedelta(hours=23)


def test_reclaim_ignores_recent_running_job(engine: Engine) -> None:
    job_id = enqueue_job()
    claim_job()
    age_running(job_id, minutes=9)
    with engine.begin() as conn:
        assert jobs.reclaim_stuck(conn) == (0, 0)
    assert get_job(job_id)["status"] == "running"


def test_late_complete_after_reclaim_is_discarded(engine: Engine) -> None:
    job_id = enqueue_job()
    old = claim_job()
    age_running(job_id)
    with engine.begin() as conn:
        jobs.reclaim_stuck(conn)
    new = claim_job()  # another worker takes it over
    assert new.attempts == 2
    with engine.begin() as conn:
        assert jobs.complete(conn, old, "stale result") is False
    row = get_job(job_id)
    assert (row["status"], row["attempts"], row["result"]) == ("running", 2, None)
    with engine.begin() as conn:
        assert jobs.complete(conn, new, "fresh result") is True
    assert get_job(job_id)["result"] == "fresh result"


def test_delete_expired_removes_only_expired_non_running(engine: Engine) -> None:
    cases = {
        "done_old": "done",
        "queued_old": "queued",
        "running_old": "running",
        "done_new": "done",
    }
    ids = {name: enqueue_job() for name in cases}
    with engine.begin() as conn:
        for name, status in cases.items():
            conn.execute(
                text(
                    "UPDATE jobs SET status = :s, expires_at = now() + "
                    "CASE WHEN :expired THEN interval '-1 minute' ELSE interval '1 hour' END "
                    "WHERE id = :id"
                ),
                {"s": status, "expired": name.endswith("_old"), "id": ids[name]},
            )
        assert jobs.delete_expired(conn) == 2
        left = conn.execute(text("SELECT id FROM jobs ORDER BY id")).scalars().all()
    assert left == [ids["running_old"], ids["done_new"]]


def test_complete_extends_expiry_from_finish(engine: Engine) -> None:
    job_id = enqueue_job()
    with engine.begin() as conn:  # queued for 20 hours: only 4 hours of the original TTL left
        conn.execute(
            text(
                "UPDATE jobs SET created_at = now() - interval '20 hours', "
                "expires_at = now() + interval '4 hours' WHERE id = :id"
            ),
            {"id": job_id},
        )
    job = claim_job()
    with engine.begin() as conn:
        jobs.complete(conn, job, "csv")
    row = get_job(job_id)
    assert row["expires_at"] - row["finished_at"] == jobs.RESULT_TTL


def test_queue_depth_counts_queued_only(engine: Engine) -> None:
    for _ in range(3):
        enqueue_job()
    with engine.connect() as conn:
        assert jobs.queue_depth(conn) == 3
    job = claim_job()
    with engine.connect() as conn:
        assert jobs.queue_depth(conn) == 2
    with engine.begin() as conn:
        jobs.fail(conn, job, "ValueError", retryable=False)
        assert jobs.queue_depth(conn) == 2


def test_active_count_ignores_expired_jobs(engine: Engine) -> None:
    first = enqueue_job("export_tasks")
    enqueue_job("export_tasks")
    enqueue_job("other_type")
    with engine.connect() as conn:
        assert jobs.active_count(conn, "export_tasks") == 2
    claim_job()  # takes `first`; running still counts
    with engine.begin() as conn:
        assert jobs.active_count(conn, "export_tasks") == 2
        conn.execute(
            text("UPDATE jobs SET expires_at = now() - interval '1 second' WHERE id = :id"),
            {"id": first},
        )
        assert jobs.active_count(conn, "export_tasks") == 1
