"""CSV export API, gated by the export_csv feature flag."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import jobs
from app.db import get_engine
from tests.helpers import claim_job, create_task, enqueue_job, make_worker, run_worker_once

FEATURE_DISABLED = {"detail": "feature_disabled"}


@pytest.fixture
def exports_on(enable_flag: Callable[..., None]) -> None:
    enable_flag("export_csv")


def test_all_export_endpoints_403_when_flag_off(client: TestClient) -> None:
    requests = [
        ("POST", "/api/exports"),
        ("GET", "/api/exports/1"),
        ("GET", "/api/exports/1/download"),
        ("GET", "/api/exports/not-a-number"),  # 403 before path validation (no 422)
        ("GET", "/api/exports/not-a-number/download"),
    ]
    for method, path in requests:
        response = client.request(method, path)
        assert (response.status_code, response.json()) == (403, FEATURE_DISABLED), path
    with get_engine().connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM jobs")).scalar_one() == 0


@pytest.mark.usefixtures("exports_on")
def test_post_returns_202_with_location(client: TestClient) -> None:
    response = client.post("/api/exports", json={"ignored": True})
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued"
    assert body["finished_at"] is None
    assert body["error"] is None
    assert response.headers["location"] == f"/api/exports/{body['id']}"
    status = client.get(response.headers["location"])
    assert status.status_code == 200
    assert status.json() == body


@pytest.mark.usefixtures("exports_on")
def test_status_404_unknown_and_wrong_type(client: TestClient) -> None:
    other = enqueue_job("not_an_export")
    for path in ("/api/exports/999999", f"/api/exports/{other}", f"/api/exports/{other}/download"):
        response = client.get(path)
        assert (response.status_code, response.json()) == (404, {"detail": "Export not found"})
    assert client.get("/api/exports/abc").status_code == 422


@pytest.mark.usefixtures("exports_on")
def test_status_404_when_expired(client: TestClient) -> None:
    export_id = client.post("/api/exports").json()["id"]
    with get_engine().begin() as conn:  # expired, but not yet deleted by the worker's cleanup
        conn.execute(
            text("UPDATE jobs SET expires_at = now() - interval '1 second' WHERE id = :id"),
            {"id": export_id},
        )
    assert client.get(f"/api/exports/{export_id}").status_code == 404
    assert client.get(f"/api/exports/{export_id}/download").status_code == 404


@pytest.mark.usefixtures("exports_on")
def test_download_409_while_queued_and_when_failed(client: TestClient) -> None:
    export_id = client.post("/api/exports").json()["id"]
    url = f"/api/exports/{export_id}/download"
    not_ready = (409, {"detail": "export_not_ready"})
    response = client.get(url)
    assert (response.status_code, response.json()) == not_ready

    job = claim_job()
    response = client.get(url)
    assert (response.status_code, response.json()) == not_ready  # running

    with get_engine().begin() as conn:
        jobs.fail(conn, job, "ValueError", retryable=False)
    response = client.get(url)
    assert (response.status_code, response.json()) == (409, {"detail": "export_failed"})
    status = client.get(f"/api/exports/{export_id}").json()
    assert (status["status"], status["error"]) == ("failed", "ValueError")
    assert status["finished_at"] is not None


@pytest.mark.usefixtures("exports_on")
def test_download_returns_bom_csv_attachment(client: TestClient) -> None:
    create_task(client, "Báo cáo, chương 2")
    export_id = client.post("/api/exports").json()["id"]
    run_worker_once(make_worker())
    assert client.get(f"/api/exports/{export_id}").json()["status"] == "done"

    response = client.get(f"/api/exports/{export_id}/download")
    assert response.status_code == 200
    assert response.content.startswith(b"\xef\xbb\xbf")
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.headers["content-disposition"] == (
        f'attachment; filename="taskapp-tasks-{export_id}.csv"'
    )
    assert response.headers["cache-control"] == "no-store"
    content = response.content.decode("utf-8-sig")
    assert content.startswith("id,title,project,labels,priority,due_date,due_time,done,created_at")
    assert '"Báo cáo, chương 2"' in content


@pytest.mark.usefixtures("exports_on")
def test_too_many_active_exports_returns_429(client: TestClient) -> None:
    for _ in range(10):
        assert client.post("/api/exports").status_code == 202
    response = client.post("/api/exports")
    assert (response.status_code, response.json()) == (429, {"detail": "too_many_exports"})

    job = claim_job()  # a finished export frees a slot
    with get_engine().begin() as conn:
        jobs.complete(conn, job, "csv")
    assert client.post("/api/exports").status_code == 202


def test_flag_toggle_takes_effect_without_restart(
    client: TestClient, enable_flag: Callable[..., None]
) -> None:
    enable_flag("export_csv")
    assert client.post("/api/exports").status_code == 202
    enable_flag("export_csv", False)
    response = client.post("/api/exports")
    assert (response.status_code, response.json()) == (403, FEATURE_DISABLED)
