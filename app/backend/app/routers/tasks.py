from collections.abc import Iterable
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import ColumnElement, func, or_, select, update
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import INBOX_NAME, Label, Project, Task
from app.schemas import LabelBrief, TaskCreate, TaskRead, TaskUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"description": "Task not found"}}


# ---------- helpers ----------


def _unprocessable(message: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, message)


def _get_or_404(db: Session, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task


def _inbox_id(db: Session) -> int:
    inbox_id = db.scalar(select(Project.id).where(Project.is_inbox))
    if inbox_id is None:  # pragma: no cover - created by migration 0002
        inbox = Project(name=INBOX_NAME, is_inbox=True, position=0)
        db.add(inbox)
        db.flush()
        inbox_id = inbox.id
    return inbox_id


def _require_project(db: Session, project_id: int) -> None:
    if db.get(Project, project_id) is None:
        raise _unprocessable(f"Project {project_id} does not exist")


def _resolve_labels(db: Session, label_ids: Iterable[int]) -> list[Label]:
    wanted = set(label_ids)
    labels = list(db.scalars(select(Label).where(Label.id.in_(wanted)))) if wanted else []
    missing = wanted - {label.id for label in labels}
    if missing:
        raise _unprocessable(f"Label {min(missing)} does not exist")
    return labels


def _next_position(db: Session, project_id: int) -> int:
    return db.scalar(
        select(func.coalesce(func.max(Task.position), 0) + 1).where(Task.project_id == project_id)
    )


def _subtask_counts(db: Session, task_ids: list[int]) -> dict[int, tuple[int, int]]:
    if not task_ids:
        return {}
    rows = db.execute(
        select(Task.parent_id, func.count(), func.count().filter(Task.done.is_(True)))
        .where(Task.parent_id.in_(task_ids))
        .group_by(Task.parent_id)
    )
    return {parent_id: (total, done) for parent_id, total, done in rows}


def _to_read(task: Task, counts: dict[int, tuple[int, int]]) -> TaskRead:
    total, done = counts.get(task.id, (0, 0))
    return TaskRead(
        id=task.id,
        project_id=task.project_id,
        parent_id=task.parent_id,
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=task.due_date,
        due_time=task.due_time,
        duration_minutes=task.duration_minutes,
        done=task.done,
        completed_at=task.completed_at,
        position=task.position,
        created_at=task.created_at,
        updated_at=task.updated_at,
        labels=[LabelBrief.model_validate(label) for label in task.labels],
        subtask_count=total,
        subtask_done_count=done,
    )


def _read_one(db: Session, task: Task) -> TaskRead:
    return _to_read(task, _subtask_counts(db, [task.id]))


def _normalize_schedule(task: Task, changes: dict) -> None:
    """Keep date / time / duration consistent after a partial update.

    Clearing a field silently clears what depends on it (no date -> no time -> no duration);
    explicitly setting a dependent field without its prerequisite is a client error.
    """
    if task.due_date is None:
        if changes.get("due_time") is not None:
            raise _unprocessable("due_time requires due_date")
        task.due_time = None
    if task.due_time is None:
        if changes.get("duration_minutes") is not None:
            raise _unprocessable("duration_minutes requires due_time")
        task.duration_minutes = None


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _search(q: str) -> ColumnElement[bool]:
    """Case- and accent-insensitive substring match on title or description."""
    pattern = func.unaccent(f"%{_escape_like(q)}%")
    return or_(
        func.unaccent(Task.title).ilike(pattern, escape="\\"),
        func.unaccent(Task.description).ilike(pattern, escape="\\"),
    )


# ---------- endpoints ----------


@router.get("", response_model=list[TaskRead])
def list_tasks(
    project_id: int | None = None,
    label_id: int | None = None,
    done: bool | None = None,
    due_from: date | None = Query(None, description="Due on or after this date"),
    due_to: date | None = Query(None, description="Due on or before this date"),
    no_due: bool = Query(False, description="Only tasks without a due date"),
    q: str | None = Query(None, max_length=200, description="Search title and description"),
    parent_id: int | None = Query(None, description="Only subtasks of this task"),
    top_level: bool = Query(False, description="Hide subtasks"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[TaskRead]:
    stmt = select(Task)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    if label_id is not None:
        stmt = stmt.where(Task.labels.any(Label.id == label_id))
    if done is not None:
        stmt = stmt.where(Task.done.is_(done))
    if due_from is not None:
        stmt = stmt.where(Task.due_date >= due_from)
    if due_to is not None:
        stmt = stmt.where(Task.due_date <= due_to)
    if no_due:
        stmt = stmt.where(Task.due_date.is_(None))
    if q and q.strip():
        stmt = stmt.where(_search(q.strip()))
    if parent_id is not None:
        stmt = stmt.where(Task.parent_id == parent_id)
    if top_level:
        stmt = stmt.where(Task.parent_id.is_(None))

    if done is True:
        order = (Task.completed_at.desc().nulls_last(), Task.id.desc())
    else:
        # Todoist "smart sort": due date (undated last) -> time (untimed last)
        # -> priority -> manual order -> age
        order = (
            Task.due_date.asc().nulls_last(),
            Task.due_time.asc().nulls_last(),
            Task.priority,
            Task.position,
            Task.created_at,
            Task.id,
        )

    tasks = list(db.scalars(stmt.order_by(*order).limit(limit).offset(offset)))
    counts = _subtask_counts(db, [t.id for t in tasks])
    return [_to_read(t, counts) for t in tasks]


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)) -> TaskRead:
    project_id = payload.project_id
    if payload.parent_id is not None:
        parent = db.get(Task, payload.parent_id)
        if parent is None:
            raise _unprocessable(f"Parent task {payload.parent_id} does not exist")
        if parent.parent_id is not None:
            raise _unprocessable("Subtasks cannot have subtasks")
        if project_id is not None and project_id != parent.project_id:
            raise _unprocessable("A subtask must be in its parent's project")
        project_id = parent.project_id
    elif project_id is None:
        project_id = _inbox_id(db)
    else:
        _require_project(db, project_id)

    task = Task(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        due_time=payload.due_time,
        duration_minutes=payload.duration_minutes,
        project_id=project_id,
        parent_id=payload.parent_id,
        position=_next_position(db, project_id),
        labels=_resolve_labels(db, payload.label_ids),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _read_one(db, task)


@router.get("/{task_id}", response_model=TaskRead, responses=NOT_FOUND)
def get_task(task_id: int, db: Session = Depends(get_db)) -> TaskRead:
    return _read_one(db, _get_or_404(db, task_id))


@router.patch(
    "/{task_id}",
    response_model=TaskRead,
    responses=NOT_FOUND | {status.HTTP_409_CONFLICT: {"description": "Subtask cannot be moved"}},
)
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)) -> TaskRead:
    task = _get_or_404(db, task_id)
    changes = payload.model_dump(exclude_unset=True)
    label_ids = changes.pop("label_ids", None)

    new_project = changes.get("project_id")
    if new_project is not None and new_project != task.project_id:
        if task.parent_id is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "A subtask moves with its parent")
        _require_project(db, new_project)
        db.execute(update(Task).where(Task.parent_id == task.id).values(project_id=new_project))

    if "done" in changes:
        if changes["done"] and not task.done:
            now = datetime.now(UTC)
            task.completed_at = now
            # Completing a parent completes its open subtasks (reopening does not).
            db.execute(
                update(Task)
                .where(Task.parent_id == task.id, Task.done.is_(False))
                .values(done=True, completed_at=now)
            )
        elif not changes["done"]:
            task.completed_at = None

    for field, value in changes.items():
        setattr(task, field, value)
    _normalize_schedule(task, changes)
    if label_ids is not None:
        task.labels = _resolve_labels(db, label_ids)

    db.commit()
    db.refresh(task)
    return _read_one(db, task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_task(task_id: int, db: Session = Depends(get_db)) -> Response:
    """Deletes the task and (via ON DELETE CASCADE) its subtasks."""
    db.delete(_get_or_404(db, task_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
