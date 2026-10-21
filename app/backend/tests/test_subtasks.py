from fastapi.testclient import TestClient

from tests.helpers import create_project, create_task


def test_subtask_inherits_parent_project(client: TestClient) -> None:
    project = create_project(client)
    parent = create_task(client, "parent", project_id=project["id"])

    child = create_task(client, "child", parent_id=parent["id"])

    assert child["parent_id"] == parent["id"]
    assert child["project_id"] == project["id"]


def test_subtask_cannot_be_put_in_another_project(client: TestClient, inbox_id: int) -> None:
    project = create_project(client)
    parent = create_task(client, "parent", project_id=project["id"])

    response = client.post(
        "/api/tasks", json={"title": "child", "parent_id": parent["id"], "project_id": inbox_id}
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "A subtask must be in its parent's project"}


def test_only_one_level_of_subtasks(client: TestClient) -> None:
    parent = create_task(client, "parent")
    child = create_task(client, "child", parent_id=parent["id"])

    response = client.post("/api/tasks", json={"title": "grandchild", "parent_id": child["id"]})

    assert response.status_code == 422
    assert response.json() == {"detail": "Subtasks cannot have subtasks"}


def test_parent_reports_subtask_counts(client: TestClient) -> None:
    parent = create_task(client, "parent")
    create_task(client, "a", parent_id=parent["id"])
    b = create_task(client, "b", parent_id=parent["id"])
    client.patch(f"/api/tasks/{b['id']}", json={"done": True})

    body = client.get(f"/api/tasks/{parent['id']}").json()

    assert (body["subtask_count"], body["subtask_done_count"]) == (2, 1)
    listed = next(t for t in client.get("/api/tasks?top_level=true").json())
    assert (listed["subtask_count"], listed["subtask_done_count"]) == (2, 1)


def test_completing_parent_completes_subtasks_but_reopening_does_not(client: TestClient) -> None:
    parent = create_task(client, "parent")
    child = create_task(client, "child", parent_id=parent["id"])

    client.patch(f"/api/tasks/{parent['id']}", json={"done": True})
    assert client.get(f"/api/tasks/{child['id']}").json()["done"] is True

    client.patch(f"/api/tasks/{parent['id']}", json={"done": False})
    assert client.get(f"/api/tasks/{parent['id']}").json()["done"] is False
    assert client.get(f"/api/tasks/{child['id']}").json()["done"] is True


def test_moving_parent_moves_subtasks(client: TestClient) -> None:
    parent = create_task(client, "parent")
    child = create_task(client, "child", parent_id=parent["id"])
    project = create_project(client)

    client.patch(f"/api/tasks/{parent['id']}", json={"project_id": project["id"]})

    assert client.get(f"/api/tasks/{child['id']}").json()["project_id"] == project["id"]


def test_subtask_cannot_be_moved_on_its_own(client: TestClient) -> None:
    parent = create_task(client, "parent")
    child = create_task(client, "child", parent_id=parent["id"])
    project = create_project(client)

    response = client.patch(f"/api/tasks/{child['id']}", json={"project_id": project["id"]})

    assert response.status_code == 409


def test_deleting_parent_deletes_subtasks(client: TestClient) -> None:
    parent = create_task(client, "parent")
    child = create_task(client, "child", parent_id=parent["id"])

    client.delete(f"/api/tasks/{parent['id']}")

    assert client.get(f"/api/tasks/{child['id']}").status_code == 404
