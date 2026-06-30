"""
TFT Arena Test Suite — as specified in the implementation_plan.md:

  Test 1: Budget System
    - Verify budgets deplete on agent utterance
    - Verify budgets replenish when the human sends a message
    - Verify agents with zero budget are not selected

  Test 2: Router / Supervisor Logic
    - Verify emergency_stop prevents any agent selection
    - Verify interrupted flag clears after one turn
    - Verify router selects all agents with remaining budget
    - Verify router selects NO agents when last message is not from human

  Test 3: Interruption Logic
    - Verify that interrupted=True aborts selection and resets the flag
    - Verify concurrent stream abort pattern

All tests run purely on the Python business logic without
hitting any LLM API or database.
"""

import pytest
from langchain_core.messages import HumanMessage, AIMessage
from app.agents.nodes.router import router_node, BUDGET_REPLENISH_AMOUNT
from app.agents.context import maybe_summarize, RECENT_WINDOW


@pytest.fixture(autouse=True)
def stub_router_scoring(monkeypatch):
    async def fake_eval_speaker_importance(messages, agents):
        return (
            {agent["name"]: 10.0 for agent in agents},
            {agent["name"]: "Selected for test." for agent in agents},
            {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "tokens_used": 10,
                "latency_ms": 25.0,
            },
        )

    monkeypatch.setattr(
        "app.agents.nodes.router.eval_speaker_importance",
        fake_eval_speaker_importance,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────


def make_agent(name: str, budget: int = 4096) -> dict:
    return {
        "id": 1,
        "name": name,
        "role_description": f"{name} role",
        "system_prompt": f"You are {name}.",
        "model": "gpt-4o-mini",
        "provider": "openai",
        "token_budget": budget,
    }


def make_state(**kwargs) -> dict:
    defaults = {
        "messages": [],
        "active_agents": [],
        "agent_budgets": {},
        "next_speakers": [],
        "interrupted": False,
        "emergency_stop": False,
        "telemetry": [],
        "room_id": 1,
        "turn_number": 0,
    }
    defaults.update(kwargs)
    return defaults


# ─────────────────────────────────────────────────────────────────────────────
# Test 1: Budget System
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestBudgetSystem:
    async def test_initial_budget_assigned_from_agent_config(self):
        """New agents get their token_budget as initial budget."""
        agent = make_agent("Analyst", budget=2000)
        state = make_state(
            active_agents=[agent],
            messages=[HumanMessage(content="hello")],
        )
        result = await router_node(state)
        assert result["agent_budgets"]["Analyst"] == 2000

    async def test_budget_replenished_on_human_message(self):
        """Speaking budget is topped up (capped at token_budget) on human turns."""
        agent = make_agent("Analyst", budget=8192)
        # Start with a depleted budget
        state = make_state(
            active_agents=[agent],
            agent_budgets={"Analyst": 100},
            messages=[HumanMessage(content="new question")],
        )
        result = await router_node(state)
        expected = min(100 + BUDGET_REPLENISH_AMOUNT, 8192)
        assert result["agent_budgets"]["Analyst"] == expected

    async def test_budget_does_not_exceed_token_budget_cap(self):
        """Budget replenishment does not exceed the per-agent token_budget cap."""
        agent = make_agent("Analyst", budget=1000)
        state = make_state(
            active_agents=[agent],
            agent_budgets={"Analyst": 900},  # already near cap
            messages=[HumanMessage(content="hello")],
        )
        result = await router_node(state)
        assert result["agent_budgets"]["Analyst"] == min(
            900 + BUDGET_REPLENISH_AMOUNT, 1000
        )

    async def test_agent_with_zero_budget_not_selected(self):
        """An agent with zero remaining budget is excluded from next_speakers."""
        rich = make_agent("Rich", budget=4096)
        broke_zero = make_agent("Broke", budget=0)
        state2 = make_state(
            active_agents=[rich, broke_zero],
            agent_budgets={"Rich": 500, "Broke": 0},
            messages=[HumanMessage(content="hello")],
        )
        result = await router_node(state2)
        assert "Rich" in result["next_speakers"]
        assert "Broke" not in result["next_speakers"]

    async def test_router_skips_immediate_self_response_on_ai_turn(self):
        """Router allows cross-talk but excludes the last speaking agent from replying immediately."""
        analyst = make_agent("Analyst", budget=4096)
        critic = make_agent("Critic", budget=4096)
        state = make_state(
            active_agents=[analyst, critic],
            agent_budgets={"Analyst": 4096, "Critic": 4096},
            messages=[
                HumanMessage(content="hello"),
                AIMessage(content="I respond", name="Analyst"),
            ],
        )
        result = await router_node(state)
        assert result["next_speakers"] == ["Critic"]


# ─────────────────────────────────────────────────────────────────────────────
# Test 2: Router / Supervisor Logic
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestRouterSupervisor:
    async def test_emergency_stop_blocks_all_selection(self):
        """emergency_stop=True → next_speakers is always empty."""
        agent = make_agent("Analyst")
        state = make_state(
            active_agents=[agent],
            agent_budgets={"Analyst": 4096},
            messages=[HumanMessage(content="go!")],
            emergency_stop=True,
        )
        result = await router_node(state)
        assert result["next_speakers"] == []

    async def test_emergency_stop_checked_before_budget_replenishment(self):
        """Emergency stop short-circuits before any budget changes."""
        agent = make_agent("Analyst", budget=4096)
        state = make_state(
            active_agents=[agent],
            agent_budgets={"Analyst": 0},  # depleted
            messages=[HumanMessage(content="go!")],
            emergency_stop=True,
        )
        result = await router_node(state)
        # Budget should remain 0 — no replenishment happened
        assert result["agent_budgets"].get("Analyst", 0) == 0
        assert result["next_speakers"] == []

    async def test_multiple_agents_all_selected_when_budgeted(self):
        """All agents with remaining budget are selected simultaneously."""
        agents = [make_agent(name) for name in ["Alpha", "Beta", "Gamma"]]
        state = make_state(
            active_agents=agents,
            agent_budgets={"Alpha": 100, "Beta": 200, "Gamma": 50},
            messages=[HumanMessage(content="go!")],
        )
        result = await router_node(state)
        assert set(result["next_speakers"]) == {"Alpha", "Beta", "Gamma"}

    async def test_turn_counter_increments(self):
        """Router increments the turn_number on each call."""
        state = make_state(
            messages=[HumanMessage(content="hi")],
            active_agents=[make_agent("X")],
            turn_number=5,
        )
        result = await router_node(state)
        assert result["turn_number"] == 6

    async def test_empty_message_list_returns_no_speakers(self):
        """Router returns no speakers when there are no messages yet."""
        state = make_state(messages=[], active_agents=[make_agent("X")])
        result = await router_node(state)
        assert result["next_speakers"] == []


# ─────────────────────────────────────────────────────────────────────────────
# Test 3: Interruption Logic
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestInterruptionLogic:
    async def test_interrupted_flag_aborts_speaker_selection(self):
        """When interrupted=True, no speakers are selected."""
        agent = make_agent("Talker")
        state = make_state(
            active_agents=[agent],
            agent_budgets={"Talker": 4096},
            messages=[HumanMessage(content="go!")],
            interrupted=True,
        )
        result = await router_node(state)
        assert result["next_speakers"] == []

    async def test_interrupted_flag_reset_after_router_pass(self):
        """Router resets interrupted=False after handling the interruption."""
        agent = make_agent("Talker")
        state = make_state(
            active_agents=[agent],
            agent_budgets={"Talker": 4096},
            messages=[HumanMessage(content="go!")],
            interrupted=True,
        )
        result = await router_node(state)
        assert result["interrupted"] is False

    async def test_interrupted_does_not_replenish_budgets(self):
        """Budget replenishment does NOT happen during an interrupted turn."""
        agent = make_agent("Talker", budget=4096)
        state = make_state(
            active_agents=[agent],
            agent_budgets={"Talker": 10},  # very low
            messages=[HumanMessage(content="new message!")],
            interrupted=True,
        )
        result = await router_node(state)
        # Interrupted short-circuits before replenishment; budget unchanged
        assert result["agent_budgets"]["Talker"] == 10

    async def test_interrupted_clears_on_subsequent_normal_turn(self):
        """After clearing interrupted, the next normal human turn selects speakers."""
        agent = make_agent("Talker")
        # First pass: interrupted
        state1 = make_state(
            active_agents=[agent],
            agent_budgets={"Talker": 4096},
            messages=[HumanMessage(content="first message")],
            interrupted=True,
        )
        result1 = await router_node(state1)
        assert result1["next_speakers"] == []
        assert result1["interrupted"] is False

        # Second pass: normal human message, interrupted is now False
        state2 = make_state(
            active_agents=[agent],
            agent_budgets=result1["agent_budgets"],
            messages=[HumanMessage(content="second message")],
            interrupted=False,
        )
        result2 = await router_node(state2)
        assert "Talker" in result2["next_speakers"]


# ─────────────────────────────────────────────────────────────────────────────
# Test 4: Context Window Eviction (async)
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestContextWindow:
    async def test_no_eviction_short_conversation(self):
        """Conversations shorter than RECENT_WINDOW are returned unchanged."""
        messages = [HumanMessage(content=f"msg {i}") for i in range(5)]
        result, was_evicted = await maybe_summarize(messages)
        assert not was_evicted
        assert len(result) == 5

    async def test_eviction_triggered_at_window_limit(self):
        """Conversations > RECENT_WINDOW trigger eviction (summary prepended)."""
        messages = [HumanMessage(content=f"msg {i}") for i in range(RECENT_WINDOW + 3)]

        # Mock the LLM call to avoid hitting the API in tests
        from unittest.mock import patch, MagicMock

        mock_response = MagicMock()
        mock_response.content = "• Point 1\n• Point 2\n• Point 3"

        with patch("app.agents.context.get_llm") as mock_get_llm:
            mock_llm = MagicMock()
            mock_llm.invoke.return_value = mock_response
            mock_get_llm.return_value = mock_llm

            result, was_evicted = await maybe_summarize(messages)

        assert was_evicted
        # Result: 1 system summary + RECENT_WINDOW recent messages
        assert len(result) == RECENT_WINDOW + 1
        assert result[0].type == "system"
        assert "CONTEXT SUMMARY" in result[0].content

    async def test_eviction_keeps_exact_recent_window(self):
        """The eviction keeps exactly the last RECENT_WINDOW messages verbatim."""
        messages = [HumanMessage(content=f"msg {i}") for i in range(RECENT_WINDOW + 5)]
        expected_recent = [m.content for m in messages[-RECENT_WINDOW:]]

        from unittest.mock import patch, MagicMock

        mock_response = MagicMock()
        mock_response.content = "Summary"

        with patch("app.agents.context.get_llm") as mock_get_llm:
            mock_llm = MagicMock()
            mock_llm.invoke.return_value = mock_response
            mock_get_llm.return_value = mock_llm

            result, _ = await maybe_summarize(messages)

        actual_recent = [m.content for m in result[1:]]  # skip summary
        assert actual_recent == expected_recent
