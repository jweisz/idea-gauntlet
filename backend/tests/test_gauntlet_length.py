"""Gauntlet length, layout, and the back-compat rule that ties them together.

Difficulty sets how many critics you face and whether you fight them in order.
The load-bearing piece is ``progression_for``: games created before length was
variable are all 8-boss free-choice games, and they must keep playing that way
forever. There is no migration tooling in this repo and the app runs in
production, so that back-compat is enforced by derivation rather than a stored
column — which makes these tests the thing standing between an existing player
and a broken save.
"""

import pytest

from app.core import config as core_config
from app.models.db import Base
from app.models.schema import Agent, BattleBoss, GauntletSession
from app.services.gauntlet import (
    DIFFICULTY_PROGRESSION,
    MAX_BOSSES,
    progression_for,
)

# Difficulty -> gauntlet length, as shipped. Written out rather than derived from
# DIFFICULTY_BOSSES so a config edit has to be made deliberately in two places.
TIERS = [("easy", 3), ("normal", 5), ("difficult", 7), ("insane", 8)]


def seed_agents(db_session, count: int = MAX_BOSSES) -> list[int]:
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


def start(client, agent_ids, difficulty=None):
    body = {"idea": "Candy is bad", "agent_ids": agent_ids}
    if difficulty is not None:
        body["difficulty"] = difficulty
    return client.post("/api/gauntlet/sessions", json=body)


# ---------------------------------------------------------------------------
# Length per difficulty
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("difficulty,expected", TIERS)
def test_each_difficulty_creates_its_own_number_of_bosses(
    client, db_session, difficulty, expected
):
    agent_ids = seed_agents(db_session)

    r = start(client, agent_ids[:expected], difficulty)

    assert r.status_code == 200
    assert len(r.json()["bosses"]) == expected
    assert db_session.query(BattleBoss).count() == expected


@pytest.mark.parametrize("difficulty,expected", TIERS)
@pytest.mark.parametrize("delta", [-1, 1])
def test_the_wrong_number_of_agents_is_rejected(
    client, db_session, difficulty, expected, delta
):
    agent_ids = seed_agents(db_session, count=MAX_BOSSES + 2)

    r = start(client, agent_ids[: expected + delta], difficulty)

    assert r.status_code == 400
    assert str(expected) in r.json()["detail"]
    assert db_session.query(GauntletSession).count() == 0


def test_duplicate_agent_ids_are_rejected(client, db_session):
    agent_ids = seed_agents(db_session)

    r = start(client, [agent_ids[0]] * 3, "easy")

    assert r.status_code == 400
    assert "Duplicate" in r.json()["detail"]


# ---------------------------------------------------------------------------
# Difficulty is resolved before the count is checked
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bogus", ["hard", "DIFFICULT", "", "insane "])
def test_an_unknown_difficulty_is_rejected_as_a_difficulty_error(
    client, db_session, bogus
):
    """Not as a count error.

    The old code silently coerced an unknown difficulty to the hardest tier.
    Now that the tier decides how many agents are required, coercing would
    report a baffling count mismatch for what is really a typo — so difficulty
    is resolved first and an unknown value is a difficulty error.
    """
    agent_ids = seed_agents(db_session)

    r = start(client, agent_ids, bogus)  # 8 ids: a valid count for *some* tier

    assert r.status_code == 400
    assert "difficulty" in r.json()["detail"]


def test_omitting_difficulty_means_normal(client, db_session):
    agent_ids = seed_agents(db_session)

    assert start(client, agent_ids[:5]).status_code == 200
    assert start(client, agent_ids).status_code == 400  # 8 is insane's length


# ---------------------------------------------------------------------------
# Back-compat: layout of existing games
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "difficulty,boss_count,expected",
    [
        # New games follow their tier.
        ("easy", 3, "linear"),
        ("normal", 5, "linear"),
        ("difficult", 7, "linear"),
        ("insane", 8, "free"),
        # Games created before length was variable are 8-boss free-choice runs
        # whatever their difficulty says, and must stay that way.
        ("easy", 8, "free"),
        ("normal", 8, "free"),
        ("difficult", 8, "free"),
        # A difficulty no longer in the config still resolves to something safe.
        ("bogus", 8, "free"),
        ("bogus", 5, "free"),
    ],
)
def test_progression_for(difficulty, boss_count, expected):
    assert progression_for(difficulty, boss_count) == expected


@pytest.mark.parametrize("difficulty,expected", TIERS)
def test_new_sessions_report_their_tier_progression(
    client, db_session, difficulty, expected
):
    agent_ids = seed_agents(db_session)

    r = start(client, agent_ids[:expected], difficulty)

    assert r.json()["progression"] == DIFFICULTY_PROGRESSION[difficulty]


def test_a_legacy_eight_boss_session_still_reports_free_choice(client, db_session):
    """The single most important assertion here: an existing production game.

    Built by hand the way the pre-change code did — 8 bosses on "normal" — and
    read back through the same endpoint the app uses to resume a save.
    """
    agent_ids = seed_agents(db_session)
    # An 8-boss roster on "normal" is unreachable through the API now, so build
    # it the way the old code did: create the 8-boss game, then set the
    # difficulty a pre-change player would have picked.
    session_id = start(client, agent_ids, "insane").json()["id"]
    row = db_session.query(GauntletSession).filter_by(id=session_id).one()
    row.difficulty = "normal"
    db_session.commit()

    r = client.get(f"/api/gauntlet/sessions/{session_id}")

    assert r.status_code == 200
    assert len(r.json()["bosses"]) == 8
    assert r.json()["progression"] == "free"


# ---------------------------------------------------------------------------
# Ordering — linear progression is meaningless without it
# ---------------------------------------------------------------------------


def test_bosses_come_back_in_the_order_they_were_chosen(client, db_session):
    agent_ids = seed_agents(db_session)
    chosen = list(reversed(agent_ids[:5]))

    created = start(client, chosen, "normal")
    fetched = client.get(f"/api/gauntlet/sessions/{created.json()['id']}")

    assert [b["agent_id"] for b in created.json()["bosses"]] == chosen
    assert [b["agent_id"] for b in fetched.json()["bosses"]] == chosen


# ---------------------------------------------------------------------------
# The linear rule is enforced server-side, not just hidden in the UI
# ---------------------------------------------------------------------------


def test_a_later_boss_cannot_be_opened_while_earlier_ones_stand(client, db_session):
    agent_ids = seed_agents(db_session)
    session = start(client, agent_ids[:3], "easy").json()
    second = session["bosses"][1]["id"]

    r = client.post(f"/api/gauntlet/sessions/{session['id']}/battles/{second}/opening")

    assert r.status_code == 409


def test_the_first_boss_is_always_open(client, db_session, monkeypatch):
    from app.api import gauntlet as gauntlet_api

    async def reply(*, agent, idea, battle_messages):
        return "Your idea is bad."

    monkeypatch.setattr(gauntlet_api, "_get_agent_reply_or_502", reply)

    agent_ids = seed_agents(db_session)
    session = start(client, agent_ids[:3], "easy").json()
    first = session["bosses"][0]["id"]

    r = client.post(f"/api/gauntlet/sessions/{session['id']}/battles/{first}/opening")

    assert r.status_code == 200


@pytest.mark.parametrize("legacy", [False, True])
def test_free_choice_sessions_can_open_any_boss(
    client, db_session, monkeypatch, legacy
):
    """Insane, and every legacy 8-boss game, stays unrestricted.

    The ``legacy`` case is the one that matters in production: a player
    mid-gauntlet on an old "normal" save must still be able to pick the last
    boss, exactly as they could before this change.
    """
    from app.api import gauntlet as gauntlet_api

    async def reply(*, agent, idea, battle_messages):
        return "Your idea is bad."

    monkeypatch.setattr(gauntlet_api, "_get_agent_reply_or_502", reply)

    agent_ids = seed_agents(db_session)
    session = start(client, agent_ids, "insane").json()
    if legacy:
        row = db_session.query(GauntletSession).filter_by(id=session["id"]).one()
        row.difficulty = "normal"
        db_session.commit()
    last = session["bosses"][-1]["id"]

    r = client.post(f"/api/gauntlet/sessions/{session['id']}/battles/{last}/opening")

    assert r.status_code == 200


# ---------------------------------------------------------------------------
# The config contract the frontend depends on
# ---------------------------------------------------------------------------


def test_config_endpoint_publishes_the_gauntlet_shape(client):
    payload = client.get("/api/config").json()

    assert payload["difficulty_bosses"] == {
        "easy": 3,
        "normal": 5,
        "difficult": 7,
        "insane": 8,
    }
    assert payload["difficulty_progression"] == {
        "easy": "linear",
        "normal": "linear",
        "difficult": "linear",
        "insane": "free",
    }


def test_random_agents_offers_the_longest_gauntlet_by_default(client, db_session):
    seed_agents(db_session, count=MAX_BOSSES + 4)

    r = client.get("/api/gauntlet/agents/random")

    assert len(r.json()) == MAX_BOSSES == 8


def test_a_partial_difficulty_override_keeps_the_rest_of_its_tier(monkeypatch):
    """config.toml may set just one key of a tier without dropping the others."""
    monkeypatch.setattr(
        core_config,
        "_config",
        lambda: {"gameplay": {"difficulty": {"easy": {"bosses": 4}}}},
    )

    easy = core_config.gameplay()["difficulty"]["easy"]

    assert easy["bosses"] == 4
    assert easy["user"] == 1.5  # not dropped by the override
    assert easy["progression"] == "linear"
    assert "insane" in core_config.gameplay()["difficulty"]


# ---------------------------------------------------------------------------
# Schema guardrail
# ---------------------------------------------------------------------------

# The app is in production and the repo has no migration tooling — create_all
# cannot alter an existing table. This work was designed to need no DDL at all
# (the new "insane" difficulty is a new *value* in an existing String column,
# and gauntlet length/layout are derived at runtime rather than stored). This
# snapshot fails the build if a later change quietly adds a column, so it is
# caught here rather than at a deploy that has no way to apply it.
EXPECTED_SCHEMA = {
    "agents": [
        "avatar_url",
        "emoji",
        "id",
        "name",
        "relevance_instructions",
        "role_description",
        "sort_order",
        "system_prompt",
        "token_budget",
    ],
    "battle_bosses": [
        "agent_hp",
        "agent_id",
        "id",
        "session_id",
        "status",
        "user_hp",
    ],
    "battle_messages": [
        "boss_id",
        "content",
        "created_at",
        "damage",
        "damage_reason",
        "id",
        "role",
    ],
    "gauntlet_sessions": [
        "agent_ids",
        "created_at",
        "difficulty",
        "id",
        "idea",
        "status",
        "summary",
        "user_id",
    ],
    "global_settings": [
        "anthropic_api_key",
        "default_agent_turn_budget",
        "global_system_instruction",
        "google_api_key",
        "id",
        "llm_model",
        "llm_provider",
        "ollama_base_url",
        "openai_api_key",
        "theme_preferences",
        "user_id",
    ],
    "leaderboard_entries": [
        "avg_damage_per_attack",
        "avg_turns_per_boss",
        "bosses_defeated",
        "created_at",
        "defeated_bosses",
        "defense_summary",
        "difficulty",
        "id",
        "idea",
        "principal",
        "session_id",
        "total_bosses",
        "user_display_name",
    ],
    "usage_events": [
        "created_at",
        "est_cost_usd",
        "id",
        "input_tokens",
        "model",
        "output_tokens",
        "principal",
        "provider",
        "session_id",
    ],
    "users": ["created_at", "email", "id", "name"],
}


def test_schema_unchanged():
    actual = {
        table.name: sorted(column.name for column in table.columns)
        for table in Base.metadata.sorted_tables
    }
    assert actual == EXPECTED_SCHEMA, (
        "The database schema changed. This app runs in production and has no "
        "migration tooling — create_all cannot alter an existing table, so this "
        "change cannot be deployed as-is. Add migrations (baselined against the "
        "live schema) before updating this snapshot."
    )
