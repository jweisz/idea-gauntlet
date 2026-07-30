"""The play-charging seams: a play is paid for when the game starts.

These exercise the core's side of the contract with the (private) hosted
overlay: ``require_play_credit`` authorizes — at the gatekeeper and again at
game creation — without debiting, and ``settle_play`` debits once the session
exists. Self-host defaults are no-ops that never block, so the fakes below stand
in for the overlay.
"""

import pytest
from fastapi import HTTPException

from app.api import gauntlet as gauntlet_api
from app.core import deps
from app.main import app
from app.models.schema import Agent
from app.services.gauntlet import IdeaCheckResult


@pytest.fixture
def charges(monkeypatch):
    """Record settle_play calls, like a hosted overlay's debit."""
    settled: list[str] = []
    monkeypatch.setattr(
        deps, "settle_play", lambda principal, db=None: settled.append(principal)
    )
    return settled


@pytest.fixture
def broke():
    """Stand in for an overlay refusing a player with an empty balance."""

    def refuse():
        raise HTTPException(status_code=402, detail="You're out of plays.")

    app.dependency_overrides[deps.require_play_credit] = refuse
    yield
    app.dependency_overrides.pop(deps.require_play_credit, None)


def fake_gatekeeper(monkeypatch, *, passed: bool):
    result = IdeaCheckResult(
        passed=passed,
        category="ok" if passed else "no_position",
        reason="" if passed else "Not a position",
    )

    async def check_idea(idea: str):
        return result

    monkeypatch.setattr(gauntlet_api, "check_idea", check_idea)


def seed_agents(db_session, count: int = 8) -> list[int]:
    agents = [
        Agent(
            name=f"Critic {i}",
            role_description="critic",
            system_prompt="be critical",
        )
        for i in range(count)
    ]
    db_session.add_all(agents)
    db_session.commit()
    return [a.id for a in agents]


def test_the_gatekeeper_is_free_and_starting_the_game_charges(
    client, db_session, monkeypatch, charges
):
    fake_gatekeeper(monkeypatch, passed=True)
    agent_ids = seed_agents(db_session, count=5)

    r = client.post("/api/gauntlet/idea-check", json={"idea": "Candy is bad"})
    assert r.status_code == 200
    assert r.json()["passed"] is True
    assert charges == []  # approving an idea costs nothing...

    r = client.post(
        "/api/gauntlet/sessions",
        json={
            "idea": "Candy is bad",
            "agent_ids": agent_ids,
            "difficulty": "normal",  # 5 bosses
        },
    )
    assert r.status_code == 200
    assert len(charges) == 1  # ...hitting START does


def test_abandoning_before_start_costs_nothing(client, monkeypatch, charges):
    """Passing the gate and walking away — the case that pushed the charge to
    START — leaves the player's balance untouched."""
    fake_gatekeeper(monkeypatch, passed=True)

    for _ in range(3):
        assert (
            client.post(
                "/api/gauntlet/idea-check", json={"idea": "Candy is bad"}
            ).status_code
            == 200
        )
    assert charges == []


def test_rejected_idea_is_free(client, monkeypatch, charges):
    fake_gatekeeper(monkeypatch, passed=False)

    r = client.post("/api/gauntlet/idea-check", json={"idea": "hello"})
    assert r.status_code == 200
    assert r.json()["passed"] is False
    assert charges == []


def test_a_malformed_game_is_not_charged(client, db_session, charges):
    agent_ids = seed_agents(db_session)

    r = client.post(
        "/api/gauntlet/sessions",
        json={
            "idea": "Candy is bad",
            "agent_ids": agent_ids[:4],
            "difficulty": "easy",  # easy is a 3-boss gauntlet
        },
    )
    assert r.status_code == 400
    assert charges == []


def test_gatekeeper_refuses_before_spending_when_balance_is_empty(
    client, monkeypatch, charges, broke
):
    called = False

    async def check_idea(idea: str):
        nonlocal called
        called = True
        return IdeaCheckResult(passed=True, category="ok", reason="")

    monkeypatch.setattr(gauntlet_api, "check_idea", check_idea)

    r = client.post("/api/gauntlet/idea-check", json={"idea": "Candy is bad"})
    assert r.status_code == 402
    # Refused before the (paid) LLM call.
    assert called is False
    assert charges == []


def test_starting_a_game_with_an_empty_balance_is_refused(
    client, db_session, charges, broke
):
    agent_ids = seed_agents(db_session, count=5)

    r = client.post(
        "/api/gauntlet/sessions",
        json={
            "idea": "Candy is bad",
            "agent_ids": agent_ids,
            "difficulty": "normal",
        },
    )
    assert r.status_code == 402
    assert charges == []
