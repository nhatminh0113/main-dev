"""Worker loop, health/metrics HTTP server and the real process (SIGTERM)."""

import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from typing import Any

import pytest
from alembic import command
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app import jobs
from app.db import get_engine
from app.worker.__main__ import SHUTDOWN_SIGNALS
from app.worker.health_server import start_server
from app.worker.loop import HEARTBEAT_STALE_SECONDS, MAINTENANCE_INTERVAL, Worker
from tests.conftest import BACKEND_DIR, TEST_DATABASE_URL, alembic_config
from tests.helpers import (
    FakeClock,
    age_running,
    claim_job,
    create_task,
    enqueue_job,
    get_job,
    make_worker,
    run_worker_once,
)


def db_error() -> OperationalError:
    return OperationalError("SELECT 1", {}, Exception("connection refused"))


def jobs_total(job_type: str, status: str) -> float:
    labels = {"type": job_type, "status": status}
    return REGISTRY.get_sample_value("taskapp_worker_jobs_total", labels) or 0.0


def wait_for(condition: Callable[[], bool], timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    while not condition():
        if time.monotonic() > deadline:
            raise AssertionError("condition not met in time")
        time.sleep(0.05)


def http_get(port: int, path: str) -> tuple[int, str, dict[str, str]]:
    url = f"http://127.0.0.1:{port}{path}"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:  # noqa: S310 - local test URL
            return response.status, response.read().decode(), dict(response.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode(), dict(exc.headers)


@contextmanager
def serving(worker: Worker) -> Iterator[int]:
    """Health server on an ephemeral port; yields the port."""
    server: ThreadingHTTPServer = start_server(worker, get_engine(), 0, host="127.0.0.1")
    try:
        yield server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()


@contextmanager
def running(worker: Worker) -> Iterator[threading.Thread]:
    """Run the loop on its own thread (as main() does); always stop and join it."""
    thread = threading.Thread(target=worker.run, name="worker-loop")
    thread.start()
    try:
        yield thread
    finally:
        worker.stop_event.set()
        thread.join(timeout=30)
        assert not thread.is_alive()


def record_waits(worker: Worker, monkeypatch: pytest.MonkeyPatch) -> list[float]:
    waits: list[float] = []

    def fake_wait(timeout: float | None = None) -> bool:
        waits.append(timeout)
        return False

    monkeypatch.setattr(worker.stop_event, "wait", fake_wait)
    return waits


# ---------- loop ----------


def test_worker_processes_export_job_end_to_end(client: TestClient) -> None:
    create_task(client, "Xuất thử")
    before = jobs_total("export_tasks", "done")
    job_id = enqueue_job("export_tasks")
    run_worker_once(make_worker())
    row = get_job(job_id)
    assert (row["status"], row["attempts"], row["error"]) == ("done", 1, None)
    assert row["result"].startswith("id,title,project,")
    assert "Xuất thử" in row["result"]
    assert jobs_total("export_tasks", "done") == before + 1


def test_stop_event_finishes_current_job_then_exits() -> None:
    started, release = threading.Event(), threading.Event()

    def blocking(payload: dict[str, Any]) -> str:
        started.set()
        release.wait(10)
        return "finished"

    worker = make_worker(handlers={"blocking_case2": blocking})
    job_id = enqueue_job("blocking_case2")
    try:
        with running(worker) as thread:
            assert started.wait(10)
            worker.stop_event.set()  # from another thread, while the handler is blocked
            time.sleep(0.3)
            assert thread.is_alive()  # the job is not interrupted
            assert worker.current_job_started is not None
            release.set()
            thread.join(timeout=10)
            assert not thread.is_alive()  # run() returned after the job
    finally:
        release.set()
    row = get_job(job_id)
    assert (row["status"], row["result"]) == ("done", "finished")
    assert worker.current_job_started is None


def test_worker_waits_for_schema_then_runs(client: TestClient) -> None:
    cfg = alembic_config()
    command.downgrade(cfg, "0004")
    try:
        worker = make_worker()
        with serving(worker) as port, running(worker):
            wait_for(lambda: worker._failures >= 1)  # saw "schema not ready" at least once
            assert worker.schema_is_ready is False
            assert http_get(port, "/readyz")[:2] == (503, '{"status": "unavailable"}')
            assert http_get(port, "/healthz")[:2] == (200, '{"status": "ok"}')

            command.upgrade(cfg, "head")
            create_task(client, "after upgrade")
            job_id = enqueue_job("export_tasks")
            wait_for(lambda: get_job(job_id)["status"] == "done")
            assert worker.schema_is_ready is True
            assert http_get(port, "/readyz")[:2] == (200, '{"status": "ready"}')
    finally:
        command.upgrade(cfg, "head")


def test_db_error_in_loop_does_not_crash(monkeypatch: pytest.MonkeyPatch) -> None:
    real_claim = jobs.claim_next
    calls = 0

    def flaky_claim(conn: Any) -> jobs.ClaimedJob | None:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise db_error()
        return real_claim(conn)

    monkeypatch.setattr(jobs, "claim_next", flaky_claim)
    job_id = enqueue_job("export_tasks")
    worker = make_worker()
    run_worker_once(worker, iterations=2)  # step 1 fails and backs off, step 2 processes
    assert get_job(job_id)["status"] == "done"
    assert worker._failures == 0
    assert worker.schema_is_ready is True  # OperationalError is not a schema problem


def test_handler_exception_retries_then_fails_storing_class_name_only() -> None:
    job_type = "always_fails_case9"

    def broken(payload: dict[str, Any]) -> str:
        raise ValueError("secret-ish detail")

    retry_before, failed_before = jobs_total(job_type, "retry"), jobs_total(job_type, "failed")
    job_id = enqueue_job(job_type)
    run_worker_once(make_worker(handlers={job_type: broken}), iterations=3)
    row = get_job(job_id)
    assert (row["status"], row["attempts"], row["error"]) == ("failed", 3, "ValueError")
    assert "secret-ish detail" not in row["error"]
    assert jobs_total(job_type, "retry") == retry_before + 2
    assert jobs_total(job_type, "failed") == failed_before + 1


def test_flaky_handler_succeeds_on_third_attempt_through_worker() -> None:
    calls = 0

    def flaky(payload: dict[str, Any]) -> str:
        nonlocal calls
        calls += 1
        if calls < 3:
            raise RuntimeError("transient")
        return "ok"

    job_id = enqueue_job("flaky_case10")
    run_worker_once(make_worker(handlers={"flaky_case10": flaky}), iterations=3)
    row = get_job(job_id)
    assert (row["status"], row["attempts"], row["result"]) == ("done", 3, "ok")


def test_outcome_write_db_error_leaves_job_running_and_loop_continues(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    real_complete = jobs.complete
    calls = 0

    def complete_fails_once(conn: Any, job: jobs.ClaimedJob, result: str) -> bool:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise db_error()
        return real_complete(conn, job, result)

    monkeypatch.setattr(jobs, "complete", complete_fails_once)
    first, second = enqueue_job("ok_case11"), enqueue_job("ok_case11")
    worker = make_worker(handlers={"ok_case11": lambda payload: "ok"})
    with running(worker):
        wait_for(lambda: get_job(second)["status"] == "done")
    assert get_job(first)["status"] == "running"  # reclaimed later (at-least-once)
    assert get_job(first)["result"] is None
    assert worker.current_job_started is None


def test_lease_lost_result_discarded_metric() -> None:
    job_type = "lease_lost_case12"

    def loses_lease(payload: dict[str, Any]) -> str:
        # Simulate a long run: another worker's maintenance reclaims this job meanwhile.
        age_running(job_id)
        with get_engine().begin() as conn:
            assert jobs.reclaim_stuck(conn) == (1, 0)
        return "late result"

    lost_before = jobs_total(job_type, "lost")
    job_id = enqueue_job(job_type)
    run_worker_once(make_worker(handlers={job_type: loses_lease}), iterations=1)
    row = get_job(job_id)
    assert (row["status"], row["attempts"], row["result"]) == ("queued", 1, None)
    assert jobs_total(job_type, "lost") == lost_before + 1


def test_maintenance_runs_first_iteration_then_every_60s(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"reclaim_stuck": 0, "delete_expired": 0}
    for name in calls:
        real = getattr(jobs, name)

        def counting(conn: Any, _real: Callable[..., Any] = real, _name: str = name) -> Any:
            calls[_name] += 1
            return _real(conn)

        monkeypatch.setattr(jobs, name, counting)

    def expired_done_job() -> int:
        job_id = enqueue_job("expired_case")
        with get_engine().begin() as conn:
            conn.execute(
                text(
                    "UPDATE jobs SET status = 'done', expires_at = now() - interval '1 minute' "
                    "WHERE id = :id"
                ),
                {"id": job_id},
            )
        return job_id

    def exists(job_id: int) -> bool:
        with get_engine().connect() as conn:
            row = conn.execute(text("SELECT 1 FROM jobs WHERE id = :id"), {"id": job_id})
            return row.first() is not None

    stuck = enqueue_job("maint_case")
    claim_job()
    age_running(stuck)
    expired = expired_done_job()
    clock = FakeClock(0.0)
    worker = make_worker(handlers={"maint_case": lambda payload: "ok"}, clock=clock)

    run_worker_once(worker)  # t=0: maintenance runs at once
    assert calls == {"reclaim_stuck": 1, "delete_expired": 1}
    row = get_job(stuck)
    assert (row["status"], row["attempts"]) == ("done", 2)  # reclaimed, then processed again
    assert not exists(expired)

    expired_later = expired_done_job()
    clock.now = 30.0
    run_worker_once(worker)  # not due yet
    assert calls == {"reclaim_stuck": 1, "delete_expired": 1}
    assert exists(expired_later)

    clock.now = MAINTENANCE_INTERVAL + 1  # t=61
    run_worker_once(worker)
    assert calls == {"reclaim_stuck": 2, "delete_expired": 2}
    assert not exists(expired_later)


def test_backoff_delay_doubles_caps_and_resets(monkeypatch: pytest.MonkeyPatch) -> None:
    slow = make_worker(poll_interval=2.0)
    delays = []
    for failures in range(1, 7):
        slow._failures = failures
        delays.append(slow.backoff_delay())
    assert delays == [2.0, 4.0, 8.0, 16.0, 30.0, 30.0]

    # A claim that does not raise resets the counter (empty queue: idle wait = poll interval).
    worker = make_worker()
    waits = record_waits(worker, monkeypatch)
    worker._failures = 5
    run_worker_once(worker)
    assert worker._failures == 0
    assert waits == [0.05]

    # An outcome-write error after a successful claim still counts (worker test 11 setup).
    real_complete = jobs.complete
    complete_calls = 0

    def complete_fails_once(conn: Any, job: jobs.ClaimedJob, result: str) -> bool:
        nonlocal complete_calls
        complete_calls += 1
        if complete_calls == 1:
            raise db_error()
        return real_complete(conn, job, result)

    monkeypatch.setattr(jobs, "complete", complete_fails_once)
    enqueue_job("ok_backoff")
    worker = make_worker(handlers={"ok_backoff": lambda payload: "ok"})
    waits = record_waits(worker, monkeypatch)
    worker._failures = 4
    run_worker_once(worker)
    assert worker._failures == 1
    assert waits == [0.05]

    # DB errors on the claim back off exponentially.
    def claim_fails(conn: Any) -> None:
        raise db_error()

    monkeypatch.setattr(jobs, "claim_next", claim_fails)
    worker = make_worker()
    waits = record_waits(worker, monkeypatch)
    run_worker_once(worker, iterations=3)
    assert worker._failures == 3
    assert waits == [0.05, 0.1, 0.2]

    # Schema missing: every check counts as a failure and waits backoff_delay().
    monkeypatch.setattr(jobs, "schema_ready", lambda conn: False)
    worker = make_worker()
    waits = record_waits(worker, monkeypatch)
    run_worker_once(worker, iterations=2)
    assert worker._failures == 2
    assert waits == [0.05, 0.1]
    assert worker.schema_is_ready is False


def test_unexpected_error_in_loop_backs_off(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(conn: Any) -> None:
        raise RuntimeError("bug")

    monkeypatch.setattr(jobs, "claim_next", boom)
    worker = make_worker()
    waits = record_waits(worker, monkeypatch)
    run_worker_once(worker, iterations=2)
    assert worker._failures == 2
    assert waits == [0.05, 0.1]


# ---------- liveness ----------


def test_healthz_stale_heartbeat_returns_503() -> None:
    clock = FakeClock(1000.0)
    worker = make_worker(clock=clock)
    assert worker.is_alive()  # heartbeat starts at construction time
    with serving(worker) as port:
        assert http_get(port, "/healthz")[:2] == (200, '{"status": "ok"}')
        clock.now += HEARTBEAT_STALE_SECONDS + 1
        assert worker.is_alive() is False
        assert http_get(port, "/healthz")[:2] == (503, '{"status": "stale"}')
        worker.last_heartbeat = clock.now
        assert http_get(port, "/healthz")[0] == 200


def test_healthz_ok_during_long_job_and_stale_after_stuck_after() -> None:
    clock = FakeClock(1000.0)
    worker = make_worker(clock=clock)
    worker.current_job_started = clock.now
    worker.last_heartbeat = clock.now - 300  # the loop does not tick while a job runs
    clock.now += 599
    assert worker.is_alive() is True
    clock.now += 2  # 601 s of job time > STUCK_AFTER
    assert worker.is_alive() is False
    worker.current_job_started = None
    assert worker.is_alive() is False  # and the heartbeat is stale too


# ---------- HTTP ----------


def test_http_metrics_exposes_worker_families() -> None:
    with serving(make_worker()) as port:
        status, body, headers = http_get(port, "/metrics")
    assert status == 200
    assert headers["Content-Type"].startswith("text/plain")
    for family in (
        "taskapp_worker_jobs_total",
        "taskapp_worker_job_duration_seconds",
        "taskapp_worker_queue_depth",
    ):
        assert f"# TYPE {family}" in body or f"# HELP {family}" in body


def test_metrics_queue_depth_reflects_backlog_while_busy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for _ in range(3):
        enqueue_job("backlog_case")
    with serving(make_worker()) as port:  # the loop is not running: only the scrape computes it
        assert "\ntaskapp_worker_queue_depth 3.0\n" in http_get(port, "/metrics")[1]
        claim_job()
        assert "\ntaskapp_worker_queue_depth 2.0\n" in http_get(port, "/metrics")[1]

        # Database down: the scrape still succeeds and keeps the last value.
        def down(conn: Any) -> int:
            raise db_error()

        monkeypatch.setattr(jobs, "queue_depth", down)
        status, body, _ = http_get(port, "/metrics")
        assert status == 200
        assert "\ntaskapp_worker_queue_depth 2.0\n" in body


def test_http_unknown_path_404() -> None:
    with serving(make_worker()) as port:
        assert http_get(port, "/nope")[:2] == (404, '{"detail": "not found"}')
        request = urllib.request.Request(f"http://127.0.0.1:{port}/healthz", method="POST")
        with pytest.raises(urllib.error.HTTPError) as exc:
            urllib.request.urlopen(request, timeout=5)  # noqa: S310 - local test URL
        assert exc.value.code == 501


def test_readyz_unavailable_when_database_down(monkeypatch: pytest.MonkeyPatch) -> None:
    def down(conn: Any) -> bool:
        raise db_error()

    monkeypatch.setattr(jobs, "schema_ready", down)
    with serving(make_worker()) as port:
        status, body, _ = http_get(port, "/readyz")
    assert (status, body) == (503, '{"status": "unavailable"}')
    assert "refused" not in body


# ---------- the real process ----------


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_sigterm_graceful_exit_subprocess() -> None:
    assert signal.SIGTERM in SHUTDOWN_SIGNALS
    port = free_port()
    env = {
        **os.environ,
        "DATABASE_URL": TEST_DATABASE_URL,
        "WORKER_HTTP_PORT": str(port),
        "WORKER_POLL_INTERVAL": "0.2",
        "LOG_FORMAT": "json",
        "LOG_LEVEL": "INFO",
    }
    proc = subprocess.Popen(  # noqa: S603 - fixed arguments, no shell
        [sys.executable, "-m", "app.worker"],
        cwd=BACKEND_DIR,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:

        def healthy() -> bool:
            assert proc.poll() is None, proc.communicate()
            try:
                return http_get(port, "/healthz")[0] == 200
            except OSError:
                return False

        wait_for(healthy, timeout=20)
        proc.send_signal(signal.SIGTERM)
        out, err = proc.communicate(timeout=15)
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.communicate()
    assert proc.returncode == 0, err
    assert err == ""
    lines = [json.loads(line) for line in out.splitlines() if line.strip()]
    messages = [line["message"] for line in lines]
    assert "worker started" in messages
    (shutdown,) = [line for line in lines if line["message"] == "shutdown requested"]
    assert shutdown["signal"] == "SIGTERM"
    assert messages[-1] == "worker stopped"
