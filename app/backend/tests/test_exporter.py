"""CSV export content (job type export_tasks)."""

import csv
import io
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import get_sessionmaker
from app.exporter import CSV_HEADER, build_tasks_csv, run_export
from tests.helpers import create_label, create_project, create_task


@pytest.fixture
def session() -> Iterator[Session]:
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()


def parse(content: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(content, newline="")))


def test_csv_header_and_rows(client: TestClient, session: Session) -> None:
    project = create_project(client, "Đồ án")
    urgent = create_label(client, "khẩn")
    home = create_label(client, "afk")
    parent = create_task(
        client,
        "Viết báo cáo",
        project_id=project["id"],
        priority=1,
        due_date="2026-10-25",
        due_time="09:30",
        label_ids=[urgent["id"], home["id"]],
    )
    child = create_task(client, "Chương 1", parent_id=parent["id"], project_id=project["id"])
    client.patch(f"/api/tasks/{child['id']}", json={"done": True})
    inbox_task = create_task(client, "Mua sữa")

    content = build_tasks_csv(session)
    assert not content.startswith("\ufeff")  # the BOM is added at download time
    assert content.startswith(",".join(CSV_HEADER) + "\r\n")
    rows = parse(content)
    assert rows[0] == list(CSV_HEADER)
    assert rows[1][:8] == [
        str(parent["id"]), "Viết báo cáo", "Đồ án", "afk;khẩn", "1", "2026-10-25", "09:30", "false",
    ]  # fmt: skip
    assert rows[2][:8] == [str(child["id"]), "Chương 1", "Đồ án", "", "4", "", "", "true"]
    assert rows[3][:3] == [str(inbox_task["id"]), "Mua sữa", "Ghi nhanh"]
    created = datetime.fromisoformat(rows[1][8])
    assert created.utcoffset() == UTC.utcoffset(None)
    assert rows[1][8].endswith("+00:00")
    assert len(rows) == 4


def test_csv_neutralises_formula_injection(client: TestClient, session: Session) -> None:
    project = create_project(client, "=HYPERLINK(1)")
    label = create_label(client, "+cmd")
    for title in ("=SUM(1)", "+1", "-1", "@x", "safe = text"):
        create_task(client, title, project_id=project["id"], label_ids=[label["id"]])

    rows = parse(build_tasks_csv(session))[1:]
    assert [r[1] for r in rows] == ["'=SUM(1)", "'+1", "'-1", "'@x", "safe = text"]
    assert {r[2] for r in rows} == {"'=HYPERLINK(1)"}
    assert {r[3] for r in rows} == {"'+cmd"}


def test_csv_handles_commas_quotes_newlines_and_vietnamese(
    client: TestClient, session: Session
) -> None:
    title = 'Họp "nhóm", phòng 3\nghi chú: đủ dấu ắ ữ'
    create_task(client, title)
    content = build_tasks_csv(session)
    assert '"Họp ""nhóm"", phòng 3\nghi chú: đủ dấu ắ ữ"' in content
    assert parse(content)[1][1] == title


def test_empty_export_has_header_only() -> None:
    assert run_export({}) == ",".join(CSV_HEADER) + "\r\n"
