"""Regression tests for LLM usage metering.

The key property: when metering runs inside a request, record_usage must write
on the request's *own* session rather than opening a second SQLite connection —
otherwise that second writer deadlocks against the write lock the request
already holds (it's paused mid-handler and can't commit to release it), which
surfaced as "database is locked".
"""

from types import SimpleNamespace

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.gauntlet import _attach_usage_context
from app.core import usage
from app.core.deps import get_current_principal
from app.models.db import Base, get_db
from app.models.schema import UsageEvent


def _fake_message(inp: int = 10, out: int = 5):
    return SimpleNamespace(usage_metadata={"input_tokens": inp, "output_tokens": out})


def test_attach_usage_context_propagates_to_endpoint(db_session):
    """The router dependency's stamp must reach the endpoint (and the service
    layer it calls). Regression: as a sync dependency it ran in a threadpool
    whose ContextVar writes were discarded, so db/principal never propagated and
    record_usage fell back to a second connection that deadlocked on SQLite.
    """
    probe = FastAPI()

    @probe.get("/t/{session_id}", dependencies=[Depends(_attach_usage_context)])
    async def _route():
        ctx = usage._usage_ctx.get()
        return {
            "db_is_request_session": ctx.db is db_session,
            "principal": ctx.principal,
            "session_id": ctx.session_id,
        }

    def _override_get_db():
        yield db_session

    probe.dependency_overrides[get_current_principal] = lambda: "u@x.com"
    probe.dependency_overrides[get_db] = _override_get_db

    try:
        with TestClient(probe) as c:
            body = c.get("/t/5").json()
    finally:
        usage.set_usage_context()  # reset the ContextVar for other tests

    assert body == {
        "db_is_request_session": True,
        "principal": "u@x.com",
        "session_id": 5,
    }


def test_record_usage_reuses_request_session_without_committing(db_session):
    # Simulate being inside a request: the request's session is in the context.
    usage.set_usage_context(principal="a@x.com", session_id=7, db=db_session)
    try:
        usage.record_usage(_fake_message(), provider="ollama", model="gemma")

        # Added to the request's OWN session (reuse), not a second connection:
        # it shows up as a pending insert on that session, attributed correctly.
        pending = [o for o in db_session.new if isinstance(o, UsageEvent)]
        assert len(pending) == 1
        assert pending[0].principal == "a@x.com"
        assert pending[0].session_id == 7
        assert pending[0].input_tokens == 10
        assert pending[0].output_tokens == 5

        # It rode the caller's transaction rather than committing on its own:
        # a rollback (as the request's teardown would on failure) discards it.
        db_session.rollback()
        assert db_session.query(UsageEvent).count() == 0
    finally:
        usage.set_usage_context()  # reset the ContextVar for other tests


def test_record_usage_falls_back_to_own_session(monkeypatch, tmp_path):
    # No request session in context -> record_usage opens and commits its own.
    db_path = tmp_path / "fallback.db"
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr(usage, "SessionLocal", TestingSessionLocal)

    usage.set_usage_context(principal="b@x.com", session_id=None, db=None)
    try:
        usage.record_usage(_fake_message(3, 4), provider="ollama", model="gemma")
    finally:
        usage.set_usage_context()

    # Committed by record_usage itself -> visible from a brand-new session.
    check = TestingSessionLocal()
    try:
        events = check.query(UsageEvent).all()
        assert len(events) == 1
        assert events[0].principal == "b@x.com"
        assert events[0].input_tokens == 3
    finally:
        check.close()
    engine.dispose()
