from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.models import TITLE_MAX_LENGTH

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TITLE_MAX_LENGTH)
]


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title


class TaskUpdate(BaseModel):
    """Partial update: only fields present in the request body are changed."""

    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    done: bool | None = None

    @model_validator(mode="after")
    def reject_explicit_null(self) -> Self:
        for field in self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"'{field}' must not be null")
        return self


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    done: bool
    created_at: datetime


class HealthStatus(BaseModel):
    status: str
