"""CSV export API. The work is done by the background worker (python -m app.worker)."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import jobs
from app.db import get_db
from app.features import require_feature
from app.models import Job
from app.schemas import ExportStatus

logger = logging.getLogger(__name__)

EXPORT_JOB_TYPE = "export_tasks"
MAX_ACTIVE_EXPORTS = 10  # soft anti-abuse cap (check-then-insert, not a strict quota)

# Router-level dependency: a disabled flag answers 403 before any 404/422 on the path.
router = APIRouter(
    prefix="/api/exports",
    tags=["exports"],
    dependencies=[Depends(require_feature("export_csv"))],
    responses={status.HTTP_403_FORBIDDEN: {"description": "feature_disabled"}},
)

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"description": "Export not found"}}


def _get_or_404(db: Session, export_id: int) -> Job:
    # Expiry is compared with the database clock, never the API pod's clock.
    job = db.scalar(
        select(Job).where(
            Job.id == export_id, Job.type == EXPORT_JOB_TYPE, Job.expires_at > func.now()
        )
    )
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Export not found")
    return job


@router.post(
    "",
    response_model=ExportStatus,
    status_code=status.HTTP_202_ACCEPTED,
    responses={status.HTTP_429_TOO_MANY_REQUESTS: {"description": "too_many_exports"}},
)
def create_export(response: Response, db: Session = Depends(get_db)) -> Job:
    # Core queue functions run on the session's connection, inside its transaction.
    conn = db.connection()
    if jobs.active_count(conn, EXPORT_JOB_TYPE) >= MAX_ACTIVE_EXPORTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too_many_exports")
    job_id = jobs.enqueue(conn, EXPORT_JOB_TYPE, {})
    db.commit()
    logger.info("export requested", extra={"job_id": job_id})
    response.headers["Location"] = f"/api/exports/{job_id}"
    return _get_or_404(db, job_id)


@router.get("/{export_id}", response_model=ExportStatus, responses=NOT_FOUND)
def get_export(export_id: int, db: Session = Depends(get_db)) -> Job:
    return _get_or_404(db, export_id)


@router.get(
    "/{export_id}/download",
    response_class=Response,
    responses={
        **NOT_FOUND,
        status.HTTP_200_OK: {"content": {"text/csv": {}}},
        status.HTTP_409_CONFLICT: {"description": "export_not_ready or export_failed"},
    },
)
def download_export(export_id: int, db: Session = Depends(get_db)) -> Response:
    job = _get_or_404(db, export_id)
    if job.status == "failed":
        raise HTTPException(status.HTTP_409_CONFLICT, "export_failed")
    if job.status != "done":
        raise HTTPException(status.HTTP_409_CONFLICT, "export_not_ready")
    # The BOM makes Excel read the file as UTF-8; the database stores plain CSV text.
    body = ("\ufeff" + (job.result or "")).encode("utf-8")
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="taskapp-tasks-{job.id}.csv"',
            "Cache-Control": "no-store",
        },
    )
