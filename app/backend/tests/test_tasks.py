from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient


def _create(client: TestClient, title: str = "Write tests") -> dict[str, Any]:
    response = client.post("/api/tasks", json={"title": title})
    assert response.status_code == 201, response.text
    return response.json()


# ---------- GET /api/tasks ----------


def test_list_tasks_is_empty_initially(client: TestClient) -> None:
    response = client.get("/api/tasks")

    assert response.status_code == 200
    assert response.json() == []


def test_list_tasks_returns_tasks_in_creation_order(client: TestClient) -> None:
    first = _create(client, "first")
    second = _create(client, "second")

    response = client.get("/api/tasks")

    assert response.status_code == 200
    assert [t["id"] for t in response.json()] == [first["id"], second["id"]]


# ---------- POST /api/tasks ----------


def test_create_task_returns_201_with_defaults(client: TestClient) -> None:
    response = client.post("/api/tasks", json={"title": "Buy milk"})

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "title", "done", "created_at"}
    assert isinstance(body["id"], int)
    assert body["title"] == "Buy milk"
    assert body["done"] is False
    # Timezone-aware ISO 8601 timestamp
    assert datetime.fromisoformat(body["created_at"]).tzinfo is not None


def test_create_task_strips_surrounding_whitespace(client: TestClient) -> None:
    body = _create(client, "   Buy milk  ")

    assert body["title"] == "Buy milk"


def test_create_task_accepts_200_character_title(client: TestClient) -> None:
    body = _create(client, "x" * 200)

    assert len(body["title"]) == 200


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 201},
        {"title": 123},
        {"title": None},
        {"title": "ok", "unexpected": "field"},
    ],
    ids=["missing", "empty", "blank", "too-long", "not-a-string", "null", "extra-field"],
)
def test_create_task_rejects_invalid_payload(client: TestClient, payload: dict) -> None:
    response = client.post("/api/tasks", json=payload)

    assert response.status_code == 422
    assert client.get("/api/tasks").json() == []


# ---------- GET /api/tasks/{id} ----------


def test_get_task_returns_task(client: TestClient) -> None:
    created = _create(client)

    response = client.get(f"/api/tasks/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_get_task_returns_404_when_missing(client: TestClient) -> None:
    response = client.get("/api/tasks/9999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}


# ---------- PATCH /api/tasks/{id} ----------


def test_patch_task_marks_done(client: TestClient) -> None:
    created = _create(client)

    response = client.patch(f"/api/tasks/{created['id']}", json={"done": True})

    assert response.status_code == 200
    assert response.json() == {**created, "done": True}
    assert client.get(f"/api/tasks/{created['id']}").json()["done"] is True


def test_patch_task_updates_title_only(client: TestClient) -> None:
    created = _create(client, "old")

    response = client.patch(f"/api/tasks/{created['id']}", json={"title": "  new  "})

    assert response.status_code == 200
    assert response.json()["title"] == "new"
    assert response.json()["done"] is False


def test_patch_task_with_empty_body_changes_nothing(client: TestClient) -> None:
    created = _create(client)

    response = client.patch(f"/api/tasks/{created['id']}", json={})

    assert response.status_code == 200
    assert response.json() == created


@pytest.mark.parametrize(
    "payload",
    [
        {"title": ""},
        {"title": "x" * 201},
        {"title": None},
        {"done": None},
        {"done": "maybe"},
        {"id": 42},
    ],
    ids=["empty-title", "too-long", "null-title", "null-done", "bad-done", "readonly-id"],
)
def test_patch_task_rejects_invalid_payload(client: TestClient, payload: dict) -> None:
    created = _create(client)

    response = client.patch(f"/api/tasks/{created['id']}", json=payload)

    assert response.status_code == 422
    assert client.get(f"/api/tasks/{created['id']}").json() == created


def test_patch_task_returns_404_when_missing(client: TestClient) -> None:
    response = client.patch("/api/tasks/9999", json={"done": True})

    assert response.status_code == 404


# ---------- DELETE /api/tasks/{id} ----------


def test_delete_task_returns_204_and_removes_it(client: TestClient) -> None:
    keep = _create(client, "keep")
    remove = _create(client, "remove")

    response = client.delete(f"/api/tasks/{remove['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get("/api/tasks").json() == [keep]


def test_delete_task_returns_404_when_missing(client: TestClient) -> None:
    response = client.delete("/api/tasks/9999")

    assert response.status_code == 404


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_task_id_must_be_an_integer(client: TestClient, method: str) -> None:
    kwargs = {"json": {"done": True}} if method == "patch" else {}

    response = getattr(client, method)("/api/tasks/abc", **kwargs)

    assert response.status_code == 422
