from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Table,
    Text,
    Time,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

PROJECT_NAME_MAX = 120
LABEL_NAME_MAX = 60
TITLE_MAX_LENGTH = 500
DESCRIPTION_MAX_LENGTH = 5000
DURATION_MIN = 15
DURATION_MAX = 720  # 12 hours
DEFAULT_PRIORITY = 4  # Todoist convention: 1 = highest (P1), 4 = normal
INBOX_NAME = "Ghi nhanh"  # the default "inbox" project (renamed in migration 0003)


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        Index(
            "uq_projects_single_inbox", "is_inbox", unique=True, postgresql_where=text("is_inbox")
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(PROJECT_NAME_MAX), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, server_default="grey")
    is_inbox: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = _created_at()


task_labels = Table(
    "task_labels",
    Base.metadata,
    Column("task_id", ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("label_id", ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True),
)


class Label(Base):
    __tablename__ = "labels"
    __table_args__ = (Index("uq_labels_name_lower", text("lower(name)"), unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(LABEL_NAME_MAX), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, server_default="grey")
    created_at: Mapped[datetime] = _created_at()


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            f"char_length(title) BETWEEN 1 AND {TITLE_MAX_LENGTH}", name="ck_tasks_title_length"
        ),
        CheckConstraint("priority BETWEEN 1 AND 4", name="ck_tasks_priority"),
        CheckConstraint(
            "due_time IS NULL OR due_date IS NOT NULL", name="ck_tasks_time_needs_date"
        ),
        CheckConstraint(
            "duration_minutes IS NULL OR (due_time IS NOT NULL AND "
            f"duration_minutes BETWEEN {DURATION_MIN} AND {DURATION_MAX})",
            name="ck_tasks_duration",
        ),
        Index("ix_tasks_open_due_date", "due_date", postgresql_where=text("NOT done")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(TITLE_MAX_LENGTH), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    priority: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=str(DEFAULT_PRIORITY)
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    # Optional start time (local wall-clock, no timezone) and length, for the week timetable.
    due_time: Mapped[time | None] = mapped_column(Time)
    duration_minutes: Mapped[int | None] = mapped_column(SmallInteger)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    labels: Mapped[list[Label]] = relationship(
        secondary=task_labels, lazy="selectin", order_by=Label.name
    )
