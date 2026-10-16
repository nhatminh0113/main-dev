import logging

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import HealthStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/healthz", response_model=HealthStatus)
def healthz() -> HealthStatus:
    """Liveness probe: the process is up. Never touches the database."""
    return HealthStatus(status="OK")  # deliberate bug: CI must turn red


@router.get(
    "/readyz",
    response_model=HealthStatus,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": HealthStatus}},
)
def readyz(db: Session = Depends(get_db)) -> HealthStatus | JSONResponse:
    """Readiness probe: the database is reachable."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        # Log the cause server-side; do not leak connection details to clients.
        logger.warning("Readiness check failed: database unreachable", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unavailable"},
        )
    return HealthStatus(status="ready")
