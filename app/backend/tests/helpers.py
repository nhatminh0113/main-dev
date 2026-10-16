from typing import Any

from fastapi.testclient import TestClient


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
