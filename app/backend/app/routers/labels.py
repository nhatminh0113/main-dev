from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Label, Task, task_labels
from app.schemas import LabelCreate, LabelRead, LabelUpdate

router = APIRouter(prefix="/api/labels", tags=["labels"])

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"description": "Label not found"}}
DUPLICATE = {status.HTTP_409_CONFLICT: {"description": "A label with this name already exists"}}


def _open_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(task_labels.c.label_id, func.count())
        .join(Task, Task.id == task_labels.c.task_id)
        .where(Task.done.is_(False))
        .group_by(task_labels.c.label_id)
    )
    return {label_id: count for label_id, count in rows}


def _read(label: Label, open_count: int) -> LabelRead:
    return LabelRead(
        id=label.id,
        name=label.name,
        color=label.color,
        created_at=label.created_at,
        open_count=open_count,
    )


def _commit_unique(db: Session) -> None:
    """Commit, turning the case-insensitive unique index violation into 409."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A label with this name already exists"
        ) from exc


def _get_or_404(db: Session, label_id: int) -> Label:
    label = db.get(Label, label_id)
    if label is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Label not found")
    return label


@router.get("", response_model=list[LabelRead])
def list_labels(db: Session = Depends(get_db)) -> list[LabelRead]:
    counts = _open_counts(db)
    labels = db.scalars(select(Label).order_by(func.lower(Label.name)))
    return [_read(lb, counts.get(lb.id, 0)) for lb in labels]


@router.post("", response_model=LabelRead, status_code=status.HTTP_201_CREATED, responses=DUPLICATE)
def create_label(payload: LabelCreate, db: Session = Depends(get_db)) -> LabelRead:
    label = Label(name=payload.name, color=payload.color)
    db.add(label)
    _commit_unique(db)
    db.refresh(label)
    return _read(label, 0)


@router.patch("/{label_id}", response_model=LabelRead, responses=NOT_FOUND | DUPLICATE)
def update_label(label_id: int, payload: LabelUpdate, db: Session = Depends(get_db)) -> LabelRead:
    label = _get_or_404(db, label_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(label, field, value)
    _commit_unique(db)
    db.refresh(label)
    return _read(label, _open_counts(db).get(label.id, 0))


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_label(label_id: int, db: Session = Depends(get_db)) -> Response:
    db.delete(_get_or_404(db, label_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
