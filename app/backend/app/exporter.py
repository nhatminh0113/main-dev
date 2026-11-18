"""CSV export of all tasks (job type `export_tasks`), built in memory."""

import csv
import io
from datetime import UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_sessionmaker
from app.models import Project, Task

CSV_HEADER = (
    "id",
    "title",
    "project",
    "labels",
    "priority",
    "due_date",
    "due_time",
    "done",
    "created_at",
)
# Cells starting with these are treated as formulas by spreadsheet apps (OWASP CSV injection).
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _safe_text(value: str) -> str:
    return "'" + value if value.startswith(_FORMULA_PREFIXES) else value


def build_tasks_csv(session: Session) -> str:
    """Every task (subtasks included) ordered by id. Plain UTF-8 text, CRLF, no BOM."""
    rows = session.execute(
        select(Task, Project.name).join(Project, Project.id == Task.project_id).order_by(Task.id)
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(CSV_HEADER)
    for task, project_name in rows:
        writer.writerow(
            (
                task.id,
                _safe_text(task.title),
                _safe_text(project_name),
                _safe_text(";".join(label.name for label in task.labels)),
                task.priority,
                task.due_date.isoformat() if task.due_date else "",
                task.due_time.strftime("%H:%M") if task.due_time else "",
                "true" if task.done else "false",
                task.created_at.astimezone(UTC).isoformat(timespec="seconds"),
            )
        )
    return buffer.getvalue()


def run_export(payload: dict[str, Any]) -> str:
    """Worker handler: the payload is unused (no export filters yet)."""
    session = get_sessionmaker()()
    try:
        return build_tasks_csv(session)
    finally:
        session.close()
