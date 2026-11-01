import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import features
from app.db import get_db
from app.models import FeatureFlag
from app.schemas import FeatureFlagRead, FeatureFlagUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/features", tags=["features"])

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"description": "Feature flag not found"}}


@router.get("", response_model=list[FeatureFlagRead])
def list_features(db: Session = Depends(get_db)) -> list[FeatureFlag]:
    """Read straight from the database (not the cache), so the settings UI shows the truth."""
    return list(db.scalars(select(FeatureFlag).order_by(FeatureFlag.key)))


@router.patch("/{key}", response_model=FeatureFlagRead, responses=NOT_FOUND)
def update_feature(
    key: str, payload: FeatureFlagUpdate, db: Session = Depends(get_db)
) -> FeatureFlag:
    flag = db.get(FeatureFlag, key)
    if flag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feature flag not found")
    flag.enabled = payload.enabled
    flag.updated_at = func.now()
    db.commit()
    db.refresh(flag)
    # Other replicas pick the change up when their cache expires (at most a few seconds).
    features.cache.invalidate()
    logger.info("feature flag changed", extra={"flag_key": key, "enabled": payload.enabled})
    return flag
