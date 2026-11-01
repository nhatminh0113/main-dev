import threading
import time
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import RowMapping, text

from app import jobs
from app.db import get_engine
from app.worker.loop import HANDLERS, Handler, Worker

TEST_POLL_INTERVAL = 0.05  # keeps the schema-gate backoff short in tests


class FakeClock:
    """Injectable monotonic clock; tests move `now` by hand."""

    def __init__(self, now: float = 0.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def make_worker(
    handlers: dict[str, Handler] | None = None,
    clock: Callable[[], float] = time.monotonic,
    poll_interval: float = TEST_POLL_INTERVAL,
) -> Worker:
    return Worker(
        get_engine(),
        HANDLERS if handlers is None else handlers,
        poll_interval,
        threading.Event(),
        clock=clock,
    )


def enqueue_job(type: str = "test_job", payload: dict[str, Any] | None = None) -> int:
    with get_engine().begin() as conn:
        return jobs.enqueue(conn, type, payload or {})


def claim_job() -> jobs.ClaimedJob | None:
    with get_engine().begin() as conn:
        return jobs.claim_next(conn)


def get_job(job_id: int) -> RowMapping:
    with get_engine().connect() as conn:
        return (
            conn.execute(text("SELECT * FROM jobs WHERE id = :id"), {"id": job_id}).mappings().one()
        )


def age_running(job_id: int, minutes: int = 11) -> None:
    """Pretend the job started `minutes` ago (the reclaim threshold is 10 minutes)."""
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE jobs SET started_at = now() - make_interval(mins => :m) WHERE id = :id"),
            {"m": minutes, "id": job_id},
        )


def run_worker_once(worker: Worker, iterations: int = 1) -> None:
    """Drive exactly `iterations` loop iterations on the calling thread."""
    for _ in range(iterations):
        worker.step()


def create_task(client: TestClient, title: str = "Write tests", **fields: Any) -> dict[str, Any]:
    response = client.post("/api/tasks", json={"title": title, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def create_project(client: TestClient, name: str = "Đồ án", **fields: Any) -> dict[str, Any]:
    response = client.post("/api/projects", json={"name": name, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def create_label(client: TestClient, name: str = "khẩn", **fields: Any) -> dict[str, Any]:
    response = client.post("/api/labels", json={"name": name, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def titles(response_json: list[dict[str, Any]]) -> list[str]:
    return [t["title"] for t in response_json]
