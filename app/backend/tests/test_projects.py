import pytest
from fastapi.testclient import TestClient

from tests.helpers import create_project, create_task


def test_inbox_exists_by_default(client: TestClient) -> None:
    response = client.get("/api/projects")

    assert response.status_code == 200
    projects = response.json()
    assert len(projects) == 1
    inbox = projects[0]
    assert inbox["is_inbox"] is True
    assert inbox["name"] == "Ghi nhanh"
    assert inbox["open_count"] == 0
    assert set(inbox) == {"id", "name", "color", "is_inbox", "position", "created_at", "open_count"}


def test_create_project_with_defaults(client: TestClient) -> None:
    response = client.post("/api/projects", json={"name": "  Đồ án DevOps "})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Đồ án DevOps"
    assert body["color"] == "grey"
    assert body["is_inbox"] is False
    assert body["open_count"] == 0


def test_projects_are_listed_inbox_first_then_by_position(client: TestClient) -> None:
    create_project(client, "B")
    create_project(client, "A")

    names = [p["name"] for p in client.get("/api/projects").json()]

    assert names == ["Ghi nhanh", "B", "A"]


def test_open_count_counts_only_open_tasks(client: TestClient) -> None:
    project = create_project(client)
    create_task(client, "open", project_id=project["id"])
    done = create_task(client, "done", project_id=project["id"])
    client.patch(f"/api/tasks/{done['id']}", json={"done": True})

    listed = {p["id"]: p for p in client.get("/api/projects").json()}

    assert listed[project["id"]]["open_count"] == 1


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"name": ""},
        {"name": "x" * 121},
        {"name": "ok", "color": "pink"},
        {"name": "ok", "x": 1},
    ],
    ids=["missing", "empty", "too-long", "bad-color", "extra-field"],
)
def test_create_project_rejects_invalid_payload(client: TestClient, payload: dict) -> None:
    assert client.post("/api/projects", json=payload).status_code == 422


def test_update_project(client: TestClient) -> None:
    project = create_project(client, "Old")

    response = client.patch(
        f"/api/projects/{project['id']}", json={"name": "New", "color": "red", "position": 9}
    )

    assert response.status_code == 200
    assert response.json() | {"created_at": None} == project | {
        "name": "New",
        "color": "red",
        "position": 9,
        "created_at": None,
    }


def test_update_missing_project_returns_404(client: TestClient) -> None:
    assert client.patch("/api/projects/999", json={"name": "x"}).status_code == 404


def test_inbox_cannot_be_modified_or_deleted(client: TestClient, inbox_id: int) -> None:
    assert client.patch(f"/api/projects/{inbox_id}", json={"name": "x"}).status_code == 409
    assert client.delete(f"/api/projects/{inbox_id}").status_code == 409


def test_delete_project_deletes_its_tasks(client: TestClient) -> None:
    project = create_project(client)
    task = create_task(client, project_id=project["id"])

    response = client.delete(f"/api/projects/{project['id']}")

    assert response.status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404
    assert client.delete(f"/api/projects/{project['id']}").status_code == 404
