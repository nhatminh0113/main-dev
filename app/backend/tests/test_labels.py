import pytest
from fastapi.testclient import TestClient

from tests.helpers import create_label, create_task


def test_labels_empty_initially(client: TestClient) -> None:
    assert client.get("/api/labels").json() == []


def test_create_label(client: TestClient) -> None:
    response = client.post("/api/labels", json={"name": " khẩn ", "color": "orange"})

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "name", "color", "created_at", "open_count"}
    assert body["name"] == "khẩn"
    assert body["color"] == "orange"
    assert body["open_count"] == 0


def test_labels_are_sorted_by_name(client: TestClient) -> None:
    create_label(client, "zeta")
    create_label(client, "alpha")

    assert [lb["name"] for lb in client.get("/api/labels").json()] == ["alpha", "zeta"]


def test_label_names_are_unique_case_insensitively(client: TestClient) -> None:
    create_label(client, "Work")

    response = client.post("/api/labels", json={"name": "work"})

    assert response.status_code == 409


@pytest.mark.parametrize(
    "name",
    ["", "x" * 61, "two words", "@at", "#hash"],
    ids=["empty", "long", "space", "at", "hash"],
)
def test_create_label_rejects_invalid_name(client: TestClient, name: str) -> None:
    assert client.post("/api/labels", json={"name": name}).status_code == 422


def test_open_count_counts_open_tasks_with_label(client: TestClient) -> None:
    label = create_label(client)
    create_task(client, "a", label_ids=[label["id"]])
    done = create_task(client, "b", label_ids=[label["id"]])
    client.patch(f"/api/tasks/{done['id']}", json={"done": True})

    assert client.get("/api/labels").json()[0]["open_count"] == 1


def test_update_label(client: TestClient) -> None:
    label = create_label(client, "old")

    response = client.patch(f"/api/labels/{label['id']}", json={"name": "new", "color": "red"})

    assert response.status_code == 200
    assert response.json()["name"] == "new"
    assert response.json()["color"] == "red"


def test_rename_label_to_existing_name_returns_409(client: TestClient) -> None:
    create_label(client, "taken")
    other = create_label(client, "other")

    assert client.patch(f"/api/labels/{other['id']}", json={"name": "TAKEN"}).status_code == 409


def test_update_or_delete_missing_label_returns_404(client: TestClient) -> None:
    assert client.patch("/api/labels/999", json={"name": "x"}).status_code == 404
    assert client.delete("/api/labels/999").status_code == 404


def test_delete_label_detaches_it_from_tasks(client: TestClient) -> None:
    label = create_label(client)
    task = create_task(client, label_ids=[label["id"]])

    assert client.delete(f"/api/labels/{label['id']}").status_code == 204

    assert client.get(f"/api/tasks/{task['id']}").json()["labels"] == []
