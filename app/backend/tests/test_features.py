"""Feature flags: API, per-process cache, fail-closed lookup."""

from collections.abc import Iterator
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import features
from app.db import get_engine, get_sessionmaker
from tests.helpers import FakeClock


@pytest.fixture
def session() -> Iterator[Session]:
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()


def ts(value: str) -> datetime:
    return datetime.fromisoformat(value)


def set_flag_in_db(key: str, enabled: bool) -> None:
    """Change a flag behind the API's back (as another replica would)."""
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE feature_flags SET enabled = :e WHERE key = :k"), {"e": enabled, "k": key}
        )


def test_list_seeded_flags_sorted(client: TestClient) -> None:
    response = client.get("/api/features")
    assert response.status_code == 200
    body = response.json()
    assert [(f["key"], f["enabled"]) for f in body] == [("export_csv", False), ("week_view", True)]
    assert list(body[0]) == ["key", "enabled", "description", "updated_at"]  # smoke-test contract
    assert all(f["description"] for f in body)
    assert '"key":"export_csv","enabled":false' in response.text


def test_patch_toggles_and_updates_timestamp(client: TestClient) -> None:
    before = {f["key"]: f for f in client.get("/api/features").json()}["export_csv"]
    response = client.patch("/api/features/export_csv", json={"enabled": True})
    assert response.status_code == 200
    body = response.json()
    assert (body["key"], body["enabled"]) == ("export_csv", True)
    assert ts(body["updated_at"]) > ts(before["updated_at"])
    listed = {f["key"]: f["enabled"] for f in client.get("/api/features").json()}
    assert listed == {"export_csv": True, "week_view": True}

    again = client.patch("/api/features/export_csv", json={"enabled": True}).json()
    assert ts(again["updated_at"]) > ts(body["updated_at"])  # a no-op PATCH still touches it


def test_patch_unknown_key_404(client: TestClient) -> None:
    response = client.patch("/api/features/dark_mode", json={"enabled": True})
    assert response.status_code == 404
    assert response.json() == {"detail": "Feature flag not found"}


@pytest.mark.parametrize(
    "body", [{"enabled": "yes"}, {"enabled": 1}, {"enabled": True, "x": 1}, {}, {"enabled": None}]
)
def test_patch_rejects_non_bool_and_extra_fields_422(client: TestClient, body: dict) -> None:
    assert client.patch("/api/features/export_csv", json=body).status_code == 422


def test_cache_ttl_bounds_staleness(session: Session) -> None:
    clock = FakeClock()
    cache = features.FlagCache(ttl=5.0, clock=clock)
    assert cache.get(session)["export_csv"] is False

    set_flag_in_db("export_csv", True)
    clock.now += 4.9
    assert cache.get(session)["export_csv"] is False  # still cached
    clock.now += 0.2
    assert cache.get(session)["export_csv"] is True  # TTL elapsed: reloaded


def test_patch_invalidates_local_cache_immediately(client: TestClient, session: Session) -> None:
    assert features.is_enabled(session, "export_csv") is False  # warms the module cache
    client.patch("/api/features/export_csv", json={"enabled": True})
    assert features.is_enabled(session, "export_csv") is True


def test_missing_flag_row_is_disabled(session: Session) -> None:
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM feature_flags WHERE key = 'week_view'"))
    features.cache.invalidate()
    assert features.is_enabled(session, "week_view") is False
    assert features.is_enabled(session, "no_such_flag") is False


def test_invalidate_during_reload_is_not_overwritten(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    clock = FakeClock()
    cache = features.FlagCache(ttl=5.0, clock=clock)
    real_load = features.FlagCache._load
    calls = 0

    def load_then_race(db: Session) -> dict[str, bool]:
        nonlocal calls
        calls += 1
        flags = real_load(db)  # reads export_csv = false ...
        if calls == 1:
            set_flag_in_db("export_csv", True)  # ... meanwhile a PATCH commits
            cache.invalidate()  # ... and invalidates this cache
        return flags

    monkeypatch.setattr(cache, "_load", load_then_race)
    assert cache.get(session)["export_csv"] is False  # the in-flight read is returned
    assert cache.get(session)["export_csv"] is True  # but was not cached: re-read at once
    assert calls == 2
