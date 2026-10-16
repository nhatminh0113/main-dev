from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from tests.helpers import create_label, create_project, create_task

TASK_FIELDS = {
    "id",
    "project_id",
    "parent_id",
    "title",
    "description",
    "priority",
    "due_date",
    "done",
    "completed_at",
    "position",
    "created_at",
    "updated_at",
    "labels",
    "subtask_count",
    "subtask_done_count",
}


# ---------- POST /api/tasks ----------


def test_create_task_with_only_a_title_goes_to_inbox(client: TestClient, inbox_id: int) -> None:
    """Backwards compatible with the original API (used by the smoke test)."""
    response = client.post("/api/tasks", json={"title": "Buy milk"})

    assert response.status_code == 201
    body = response.json()
    assert set(body) == TASK_FIELDS
    assert body["title"] == "Buy milk"
    assert body["project_id"] == inbox_id
    assert body["parent_id"] is None
    assert body["description"] == ""
    assert body["priority"] == 4
    assert body["due_date"] is None
    assert body["done"] is False
    assert body["completed_at"] is None
    assert body["labels"] == []
    assert body["subtask_count"] == 0
    assert datetime.fromisoformat(body["created_at"]).tzinfo is not None


def test_create_task_with_all_fields(client: TestClient) -> None:
    project = create_project(client)
    label = create_label(client, "khẩn", color="red")

    body = create_task(
        client,
        "  Nộp báo cáo  ",
        description="Bản PDF",
        priority=1,
        due_date="2026-10-17",
        project_id=project["id"],
        label_ids=[label["id"]],
    )

    assert body["title"] == "Nộp báo cáo"
    assert body["description"] == "Bản PDF"
    assert body["priority"] == 1
    assert body["due_date"] == "2026-10-17"
    assert body["project_id"] == project["id"]
    assert body["labels"] == [{"id": label["id"], "name": "khẩn", "color": "red"}]


def test_create_task_accepts_500_character_title(client: TestClient) -> None:
    assert len(create_task(client, "x" * 500)["title"]) == 500


def test_positions_increase_within_a_project(client: TestClient) -> None:
    first = create_task(client, "a")
    second = create_task(client, "b")

    assert second["position"] > first["position"]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 501},
        {"title": 123},
        {"title": None},
        {"title": "ok", "unexpected": "field"},
        {"title": "ok", "priority": 0},
        {"title": "ok", "priority": 5},
        {"title": "ok", "due_date": "17/10/2026"},
        {"title": "ok", "description": "x" * 5001},
    ],
    ids=[
        "missing",
        "empty",
        "blank",
        "too-long",
        "not-a-string",
        "null",
        "extra-field",
        "priority-0",
        "priority-5",
        "bad-date",
        "long-description",
    ],
)
def test_create_task_rejects_invalid_payload(client: TestClient, payload: dict) -> None:
    response = client.post("/api/tasks", json=payload)

    assert response.status_code == 422
    assert client.get("/api/tasks").json() == []


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("project_id", 999, "Project 999 does not exist"),
        ("label_ids", [999], "Label 999 does not exist"),
        ("parent_id", 999, "Parent task 999 does not exist"),
    ],
)
def test_create_task_with_unknown_reference_returns_422(
    client: TestClient, field: str, value: object, message: str
) -> None:
    response = client.post("/api/tasks", json={"title": "x", field: value})

    assert response.status_code == 422
    assert response.json() == {"detail": message}


# ---------- GET /api/tasks/{id} ----------


def test_get_task_returns_task(client: TestClient) -> None:
    created = create_task(client)

    response = client.get(f"/api/tasks/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_get_task_returns_404_when_missing(client: TestClient) -> None:
    response = client.get("/api/tasks/9999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}


# ---------- PATCH /api/tasks/{id} ----------


def test_patch_done_sets_and_clears_completed_at(client: TestClient) -> None:
    created = create_task(client)

    done = client.patch(f"/api/tasks/{created['id']}", json={"done": True}).json()
    assert done["done"] is True
    assert datetime.fromisoformat(done["completed_at"]).tzinfo is not None

    reopened = client.patch(f"/api/tasks/{created['id']}", json={"done": False}).json()
    assert reopened["done"] is False
    assert reopened["completed_at"] is None


def test_patch_updates_several_fields(client: TestClient) -> None:
    created = create_task(client, "old")
    project = create_project(client)

    response = client.patch(
        f"/api/tasks/{created['id']}",
        json={
            "title": "  new  ",
            "description": "chi tiết",
            "priority": 2,
            "due_date": "2026-12-01",
            "project_id": project["id"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["title"], body["description"], body["priority"]) == ("new", "chi tiết", 2)
    assert (body["due_date"], body["project_id"]) == ("2026-12-01", project["id"])
    assert body["done"] is False


def test_patch_due_date_null_clears_it(client: TestClient) -> None:
    created = create_task(client, due_date="2026-10-20")

    response = client.patch(f"/api/tasks/{created['id']}", json={"due_date": None})

    assert response.status_code == 200
    assert response.json()["due_date"] is None


def test_patch_label_ids_replaces_labels(client: TestClient) -> None:
    a, b = create_label(client, "a"), create_label(client, "b")
    created = create_task(client, label_ids=[a["id"]])

    response = client.patch(f"/api/tasks/{created['id']}", json={"label_ids": [b["id"]]})

    assert [lb["name"] for lb in response.json()["labels"]] == ["b"]


def test_patch_with_empty_body_changes_nothing(client: TestClient) -> None:
    created = create_task(client)

    response = client.patch(f"/api/tasks/{created['id']}", json={})

    assert response.status_code == 200
    assert response.json() == created


@pytest.mark.parametrize(
    "payload",
    [
        {"title": ""},
        {"title": "x" * 501},
        {"title": None},
        {"done": None},
        {"done": "maybe"},
        {"priority": None},
        {"project_id": None},
        {"label_ids": None},
        {"id": 42},
        {"parent_id": 1},
    ],
    ids=[
        "empty-title",
        "too-long",
        "null-title",
        "null-done",
        "bad-done",
        "null-priority",
        "null-project",
        "null-labels",
        "readonly-id",
        "readonly-parent",
    ],
)
def test_patch_task_rejects_invalid_payload(client: TestClient, payload: dict) -> None:
    created = create_task(client)

    response = client.patch(f"/api/tasks/{created['id']}", json=payload)

    assert response.status_code == 422
    assert client.get(f"/api/tasks/{created['id']}").json() == created


def test_patch_with_unknown_project_or_label_returns_422(client: TestClient) -> None:
    created = create_task(client)

    assert client.patch(f"/api/tasks/{created['id']}", json={"project_id": 999}).status_code == 422
    assert client.patch(f"/api/tasks/{created['id']}", json={"label_ids": [999]}).status_code == 422


def test_patch_task_returns_404_when_missing(client: TestClient) -> None:
    assert client.patch("/api/tasks/9999", json={"done": True}).status_code == 404


# ---------- DELETE /api/tasks/{id} ----------


def test_delete_task_returns_204_and_removes_it(client: TestClient) -> None:
    keep = create_task(client, "keep")
    remove = create_task(client, "remove")

    response = client.delete(f"/api/tasks/{remove['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get("/api/tasks").json() == [keep]


def test_delete_task_returns_404_when_missing(client: TestClient) -> None:
    assert client.delete("/api/tasks/9999").status_code == 404


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_task_id_must_be_an_integer(client: TestClient, method: str) -> None:
    kwargs = {"json": {"done": True}} if method == "patch" else {}

    response = getattr(client, method)("/api/tasks/abc", **kwargs)

    assert response.status_code == 422
