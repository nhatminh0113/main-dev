"""Filtering, searching, sorting and pagination of GET /api/tasks."""

import pytest
from fastapi.testclient import TestClient

from tests.helpers import create_label, create_project, create_task, titles


def _complete(client: TestClient, task: dict) -> None:
    assert client.patch(f"/api/tasks/{task['id']}", json={"done": True}).status_code == 200


def test_list_is_empty_initially(client: TestClient) -> None:
    response = client.get("/api/tasks")

    assert response.status_code == 200
    assert response.json() == []


def test_smart_sort_due_date_then_priority_then_position(client: TestClient) -> None:
    """Todoist order: due date (no date last) -> priority (p1 first) -> manual position."""
    create_task(client, "no date p1", priority=1)
    create_task(client, "20th p4", due_date="2026-10-20")
    create_task(client, "18th p3", due_date="2026-10-18", priority=3)
    create_task(client, "18th p1", due_date="2026-10-18", priority=1)
    create_task(client, "18th p1 later", due_date="2026-10-18", priority=1)
    create_task(client, "no date p4")

    assert titles(client.get("/api/tasks").json()) == [
        "18th p1",
        "18th p1 later",
        "18th p3",
        "20th p4",
        "no date p1",
        "no date p4",
    ]


def test_filter_by_done(client: TestClient) -> None:
    create_task(client, "open")
    _complete(client, create_task(client, "closed"))

    assert titles(client.get("/api/tasks?done=false").json()) == ["open"]
    assert titles(client.get("/api/tasks?done=true").json()) == ["closed"]
    assert len(client.get("/api/tasks").json()) == 2


def test_completed_tasks_are_sorted_most_recent_first(client: TestClient) -> None:
    first, second = create_task(client, "first"), create_task(client, "second")
    _complete(client, first)
    _complete(client, second)

    assert titles(client.get("/api/tasks?done=true").json()) == ["second", "first"]


def test_today_view_includes_overdue(client: TestClient) -> None:
    """Today = open tasks due on or before the client's date."""
    create_task(client, "overdue", due_date="2026-10-10")
    create_task(client, "today", due_date="2026-10-16")
    create_task(client, "tomorrow", due_date="2026-10-17")
    create_task(client, "someday")
    _complete(client, create_task(client, "done today", due_date="2026-10-16"))

    response = client.get("/api/tasks?done=false&due_to=2026-10-16")

    assert titles(response.json()) == ["overdue", "today"]


def test_upcoming_view_uses_a_date_range(client: TestClient) -> None:
    for day in ("2026-10-16", "2026-10-17", "2026-10-23", "2026-10-24"):
        create_task(client, day, due_date=day)

    response = client.get("/api/tasks?due_from=2026-10-17&due_to=2026-10-23")

    assert titles(response.json()) == ["2026-10-17", "2026-10-23"]


def test_filter_tasks_without_due_date(client: TestClient) -> None:
    create_task(client, "dated", due_date="2026-10-16")
    create_task(client, "undated")

    assert titles(client.get("/api/tasks?no_due=true").json()) == ["undated"]


def test_filter_by_project(client: TestClient, inbox_id: int) -> None:
    project = create_project(client)
    create_task(client, "in project", project_id=project["id"])
    create_task(client, "in inbox")

    assert titles(client.get(f"/api/tasks?project_id={project['id']}").json()) == ["in project"]
    assert titles(client.get(f"/api/tasks?project_id={inbox_id}").json()) == ["in inbox"]


def test_filter_by_label(client: TestClient) -> None:
    label = create_label(client)
    create_task(client, "labelled", label_ids=[label["id"]])
    create_task(client, "plain")

    assert titles(client.get(f"/api/tasks?label_id={label['id']}").json()) == ["labelled"]


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("helm", ["Viết Helm chart"]),
        ("HELM", ["Viết Helm chart"]),
        ("hoc", ["Học Docker"]),  # accent-insensitive
        ("dong", ["Đọc tài liệu đóng gói"]),  # accents and đ are ignored
        ("PDF", ["Nộp báo cáo"]),  # matches description
        ("100%", ["Đạt 100% coverage"]),  # LIKE wildcards are escaped
        ("_", []),
    ],
)
def test_search_title_and_description(client: TestClient, query: str, expected: list[str]) -> None:
    create_task(client, "Viết Helm chart")
    create_task(client, "Học Docker")
    create_task(client, "Đọc tài liệu đóng gói")
    create_task(client, "Nộp báo cáo", description="Bản PDF")
    create_task(client, "Đạt 100% coverage")

    response = client.get("/api/tasks", params={"q": query})

    assert response.status_code == 200
    assert sorted(titles(response.json())) == sorted(expected)


def test_top_level_hides_subtasks(client: TestClient) -> None:
    parent = create_task(client, "parent")
    create_task(client, "child", parent_id=parent["id"])

    assert titles(client.get("/api/tasks?top_level=true").json()) == ["parent"]
    assert titles(client.get(f"/api/tasks?parent_id={parent['id']}").json()) == ["child"]


def test_pagination(client: TestClient) -> None:
    for i in range(5):
        create_task(client, f"t{i}")

    page = client.get("/api/tasks?limit=2&offset=2").json()

    assert titles(page) == ["t2", "t3"]


@pytest.mark.parametrize(
    "query", ["limit=0", "limit=501", "offset=-1", "due_to=yesterday", "project_id=abc"]
)
def test_invalid_query_parameters_return_422(client: TestClient, query: str) -> None:
    assert client.get(f"/api/tasks?{query}").status_code == 422
