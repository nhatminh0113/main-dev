from datetime import date, datetime, time
from typing import Annotated, ClassVar, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models import (
    DESCRIPTION_MAX_LENGTH,
    DURATION_MAX,
    DURATION_MIN,
    LABEL_NAME_MAX,
    PROJECT_NAME_MAX,
    TITLE_MAX_LENGTH,
)

# Named palette; the frontend maps names to actual colours (light and dark themes).
Color = Literal[
    "red", "orange", "yellow", "olive", "green", "teal",
    "sky", "blue", "indigo", "violet", "magenta", "grey",
]  # fmt: skip

Priority = Annotated[int, Field(ge=1, le=4, description="1 = highest (P1), 4 = normal")]
Duration = Annotated[int, Field(ge=DURATION_MIN, le=DURATION_MAX, description="Minutes")]

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TITLE_MAX_LENGTH)
]
Description = Annotated[str, StringConstraints(max_length=DESCRIPTION_MAX_LENGTH)]
ProjectName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=PROJECT_NAME_MAX)
]
# Labels are referenced as "@name" in quick add, so no whitespace, "@" or "#".
LabelName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=LABEL_NAME_MAX, pattern=r"^[^\s@#]+$"
    ),
]


class PatchModel(BaseModel):
    """Partial update: only fields present in the body change; null only where allowed."""

    model_config = ConfigDict(extra="forbid")
    nullable_fields: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def reject_explicit_null(self) -> Self:
        for field in self.model_fields_set - self.nullable_fields:
            if getattr(self, field) is None:
                raise ValueError(f"'{field}' must not be null")
        return self


# ---------- Projects ----------


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ProjectName
    color: Color = "grey"


class ProjectUpdate(PatchModel):
    name: ProjectName | None = None
    color: Color | None = None
    position: int | None = None


class ProjectRead(BaseModel):
    id: int
    name: str
    color: str
    is_inbox: bool
    position: int
    created_at: datetime
    open_count: int


# ---------- Labels ----------


class LabelCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: LabelName
    color: Color = "grey"


class LabelUpdate(PatchModel):
    name: LabelName | None = None
    color: Color | None = None


class LabelBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str


class LabelRead(LabelBrief):
    created_at: datetime
    open_count: int


# ---------- Tasks ----------


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    description: Description = ""
    priority: Priority = 4
    due_date: date | None = None
    due_time: time | None = Field(default=None, description="Local start time, e.g. 09:30")
    duration_minutes: Duration | None = None
    project_id: int | None = Field(default=None, description="Defaults to the Inbox")
    parent_id: int | None = None
    label_ids: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def time_needs_date(self) -> Self:
        if self.due_time is not None and self.due_date is None:
            raise ValueError("due_time requires due_date")
        if self.duration_minutes is not None and self.due_time is None:
            raise ValueError("duration_minutes requires due_time")
        return self


class TaskUpdate(PatchModel):
    nullable_fields: ClassVar[frozenset[str]] = frozenset(
        {"due_date", "due_time", "duration_minutes"}
    )

    title: Title | None = None
    description: Description | None = None
    priority: Priority | None = None
    due_date: date | None = None
    due_time: time | None = None
    duration_minutes: Duration | None = None
    done: bool | None = None
    project_id: int | None = None
    position: int | None = None
    label_ids: list[int] | None = None


class TaskRead(BaseModel):
    id: int
    project_id: int
    parent_id: int | None
    title: str
    description: str
    priority: int
    due_date: date | None
    due_time: time | None
    duration_minutes: int | None
    done: bool
    completed_at: datetime | None
    position: int
    created_at: datetime
    updated_at: datetime
    labels: list[LabelBrief]
    subtask_count: int
    subtask_done_count: int


class HealthStatus(BaseModel):
    status: str
