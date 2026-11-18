"""Optional start time and duration on tasks (weekly timetable view)."""

import pytest
from fastapi.testclient import TestClient

from tests.helpers import create_task, titles


def test_create_task_with_time_and_duration(client: TestClient) -> None:
    body = create_task(
        client, "Họp nhóm", due_date="2026-10-16", due_time="09:30", duration_minutes=90
    )

    assert body["due_time"] == "09:30:00"
    assert body["duration_minutes"] == 90


def test_time_and_duration_default_to_null(client: TestClient) -> None:
    body = create_task(client, "Không giờ", due_date="2026-10-16")

    assert body["due_time"] is None
    assert body["duration_minutes"] is None


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"due_time": "09:00"}, "due_time requires due_date"),
        ({"due_date": "2026-10-16", "duration_minutes": 60}, "duration_minutes requires due_time"),
    ],
)
def test_time_requires_date_and_duration_requires_time(
    client: TestClient, payload: dict, message: str
) -> None:
    response = client.post("/api/tasks", json={"title": "x", **payload})

    assert response.status_code == 422
    assert message in response.text


@pytest.mark.parametrize("minutes", [0, 14, 721])
def test_duration_bounds(client: TestClient, minutes: int) -> None:
    response = client.post(
        "/api/tasks",
        json={
            "title": "x",
            "due_date": "2026-10-16",
            "due_time": "09:00",
            "duration_minutes": minutes,
        },
    )

    assert response.status_code == 422


@pytest.mark.parametrize("value", ["25:00", "9h", "morning"])
def test_invalid_time_is_rejected(client: TestClient, value: str) -> None:
    response = client.post(
        "/api/tasks", json={"title": "x", "due_date": "2026-10-16", "due_time": value}
    )

    assert response.status_code == 422


def test_patch_sets_time_on_a_dated_task(client: TestClient) -> None:
    task = create_task(client, due_date="2026-10-16")

    response = client.patch(
        f"/api/tasks/{task['id']}", json={"due_time": "14:00", "duration_minutes": 45}
    )

    assert response.status_code == 200
    assert (response.json()["due_time"], response.json()["duration_minutes"]) == ("14:00:00", 45)


def test_patch_time_on_undated_task_returns_422(client: TestClient) -> None:
    task = create_task(client)

    response = client.patch(f"/api/tasks/{task['id']}", json={"due_time": "14:00"})

    assert response.status_code == 422
    assert response.json() == {"detail": "due_time requires due_date"}


def test_patch_duration_without_time_returns_422(client: TestClient) -> None:
    task = create_task(client, due_date="2026-10-16")

    response = client.patch(f"/api/tasks/{task['id']}", json={"duration_minutes": 30})

    assert response.status_code == 422
    assert response.json() == {"detail": "duration_minutes requires due_time"}


def test_clearing_the_date_clears_time_and_duration(client: TestClient) -> None:
    task = create_task(client, due_date="2026-10-16", due_time="09:00", duration_minutes=60)

    body = client.patch(f"/api/tasks/{task['id']}", json={"due_date": None}).json()

    assert (body["due_date"], body["due_time"], body["duration_minutes"]) == (None, None, None)


def test_clearing_the_time_clears_duration(client: TestClient) -> None:
    task = create_task(client, due_date="2026-10-16", due_time="09:00", duration_minutes=60)

    body = client.patch(f"/api/tasks/{task['id']}", json={"due_time": None}).json()

    assert (body["due_date"], body["due_time"], body["duration_minutes"]) == (
        "2026-10-16",
        None,
        None,
    )


def test_moving_the_date_keeps_the_time(client: TestClient) -> None:
    task = create_task(client, due_date="2026-10-16", due_time="09:00")

    body = client.patch(f"/api/tasks/{task['id']}", json={"due_date": "2026-10-20"}).json()

    assert (body["due_date"], body["due_time"]) == ("2026-10-20", "09:00:00")


def test_smart_sort_orders_by_time_within_a_day_untimed_last(client: TestClient) -> None:
    create_task(client, "no time p1", due_date="2026-10-16", priority=1)
    create_task(client, "14:00", due_date="2026-10-16", due_time="14:00")
    create_task(client, "08:00", due_date="2026-10-16", due_time="08:00")
    create_task(client, "next day 07:00", due_date="2026-10-17", due_time="07:00")

    assert titles(client.get("/api/tasks").json()) == [
        "08:00",
        "14:00",
        "no time p1",
        "next day 07:00",
    ]
