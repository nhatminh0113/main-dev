from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Project, Task
from app.schemas import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"description": "Project not found"}}
INBOX_LOCKED = {status.HTTP_409_CONFLICT: {"description": "The Inbox cannot be changed"}}


def _open_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(Task.project_id, func.count()).where(Task.done.is_(False)).group_by(Task.project_id)
    )
    return {project_id: count for project_id, count in rows}


def _read(project: Project, open_count: int) -> ProjectRead:
    return ProjectRead(
        id=project.id,
        name=project.name,
        color=project.color,
        is_inbox=project.is_inbox,
        position=project.position,
        created_at=project.created_at,
        open_count=open_count,
    )


def _get_editable_or_error(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if project.is_inbox:
        raise HTTPException(status.HTTP_409_CONFLICT, "The Inbox cannot be changed")
    return project


@router.get("", response_model=list[ProjectRead])
def list_projects(db: Session = Depends(get_db)) -> list[ProjectRead]:
    counts = _open_counts(db)
    projects = db.scalars(
        select(Project).order_by(Project.is_inbox.desc(), Project.position, Project.id)
    )
    return [_read(p, counts.get(p.id, 0)) for p in projects]


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)) -> ProjectRead:
    next_position = db.scalar(select(func.coalesce(func.max(Project.position), 0) + 1))
    project = Project(name=payload.name, color=payload.color, position=next_position)
    db.add(project)
    db.commit()
    db.refresh(project)
    return _read(project, 0)


@router.patch("/{project_id}", response_model=ProjectRead, responses=NOT_FOUND | INBOX_LOCKED)
def update_project(
    project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)
) -> ProjectRead:
    project = _get_editable_or_error(db, project_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return _read(project, _open_counts(db).get(project.id, 0))


@router.delete(
    "/{project_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND | INBOX_LOCKED
)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> Response:
    """Deletes the project and (via ON DELETE CASCADE) all of its tasks."""
    project = _get_editable_or_error(db, project_id)
    db.delete(project)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
