"""Feature flags stored in the `feature_flags` table, cached per process for a few seconds.

A toggle reaches every replica within the TTL without a restart or redeploy. A flag that has
no row is treated as disabled (fail closed).
"""

import threading
import time
from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import FeatureFlag

CACHE_TTL_SECONDS = 5.0


class FlagCache:
    def __init__(
        self, ttl: float = CACHE_TTL_SECONDS, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._ttl = ttl
        self._clock = clock
        self._lock = threading.Lock()
        self._flags: dict[str, bool] | None = None
        self._loaded_at = 0.0
        # Bumped by invalidate(): a reload that overlapped an invalidation is not cached,
        # so it cannot put back a value read before the change.
        self._generation = 0

    def get(self, db: Session) -> dict[str, bool]:
        with self._lock:
            if self._flags is not None and self._clock() - self._loaded_at < self._ttl:
                return self._flags
            generation = self._generation
        started = self._clock()
        flags = self._load(db)
        with self._lock:
            if self._generation == generation:
                self._flags = flags
                self._loaded_at = started
        return flags

    def invalidate(self) -> None:
        with self._lock:
            self._flags = None
            self._generation += 1

    @staticmethod
    def _load(db: Session) -> dict[str, bool]:
        rows = db.execute(select(FeatureFlag.key, FeatureFlag.enabled))
        return {key: enabled for key, enabled in rows}


cache = FlagCache()


def is_enabled(db: Session, key: str) -> bool:
    return cache.get(db).get(key, False)


def require_feature(key: str) -> Callable[[Session], None]:
    """Dependency factory: 403 {"detail": "feature_disabled"} while the flag is off."""

    def dependency(db: Session = Depends(get_db)) -> None:
        if not is_enabled(db, key):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "feature_disabled")

    return dependency
