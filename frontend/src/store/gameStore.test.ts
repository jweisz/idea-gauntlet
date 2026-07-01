import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "./gameStore";
import type {
  AgentSummary,
  BattleBossOut,
  BattleMessageOut,
  SessionOut,
} from "../lib/api";

function makeAgent(id: number, name: string): AgentSummary {
  return {
    id,
    name,
    emoji: "🤖",
    role_description: `${name} role`,
    provider: "ollama",
    model: "llama3",
  };
}

function makeBoss(id: number, agentId: number): BattleBossOut {
  return {
    id,
    agent_id: agentId,
    status: "active",
    user_hp: 100,
    agent_hp: 100,
    agent: makeAgent(agentId, `Boss ${id}`),
    messages: [],
  };
}

function makeSession(bosses: BattleBossOut[]): SessionOut {
  return {
    id: 42,
    idea: "Ship it on Friday",
    agent_ids: "1,2",
    status: "active",
    difficulty: "difficult",
    summary: null,
    created_at: "2026-01-01T00:00:00Z",
    bosses,
  };
}

function makeMessage(id: number): BattleMessageOut {
  return {
    id,
    role: "user",
    content: `msg ${id}`,
    damage: 10,
    created_at: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({
    pendingIdea: "",
    session: null,
    activeBossId: null,
    pendingAgents: [],
    pendingAgentModels: {},
    liveHp: {},
    pendingMessages: {},
  });
});

describe("gameStore session lifecycle", () => {
  it("setSession persists the id to localStorage", () => {
    const session = makeSession([makeBoss(1, 10)]);
    useGameStore.getState().setSession(session);

    expect(useGameStore.getState().session).toEqual(session);
    expect(localStorage.getItem("gauntlet_session_id")).toBe("42");
  });

  it("clearSession resets state and removes the persisted id", () => {
    const store = useGameStore.getState();
    store.setSession(makeSession([makeBoss(1, 10)]));
    store.setActiveBossId(1);
    store.setLiveHp(1, 80, 60);
    store.setPendingIdea("leftover");

    useGameStore.getState().clearSession();

    const state = useGameStore.getState();
    expect(state.session).toBeNull();
    expect(state.activeBossId).toBeNull();
    expect(state.liveHp).toEqual({});
    expect(state.pendingMessages).toEqual({});
    expect(state.pendingIdea).toBe("");
    expect(localStorage.getItem("gauntlet_session_id")).toBeNull();
  });
});

describe("gameStore pending agents and model overrides", () => {
  it("swapPendingAgent replaces the agent at the given slot", () => {
    const store = useGameStore.getState();
    store.setPendingAgents([makeAgent(1, "A"), makeAgent(2, "B")]);
    store.swapPendingAgent(1, makeAgent(3, "C"));

    expect(useGameStore.getState().pendingAgents.map((a) => a.name)).toEqual([
      "A",
      "C",
    ]);
  });

  it("set/clear per-slot model overrides", () => {
    const store = useGameStore.getState();
    store.setPendingAgentModel(2, "anthropic", "claude-opus-4-8");
    expect(useGameStore.getState().pendingAgentModels[2]).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-8",
    });

    store.clearPendingAgentModel(2);
    expect(useGameStore.getState().pendingAgentModels[2]).toBeUndefined();
  });

  it("setAllPendingAgentModels fills all 8 slots", () => {
    useGameStore.getState().setAllPendingAgentModels("openai", "gpt-4o-mini");
    const models = useGameStore.getState().pendingAgentModels;

    expect(Object.keys(models)).toHaveLength(8);
    expect(models[0]).toEqual({ provider: "openai", model: "gpt-4o-mini" });
    expect(models[7]).toEqual({ provider: "openai", model: "gpt-4o-mini" });
  });
});

describe("gameStore live HP and getBoss", () => {
  it("getBoss merges live HP over the session snapshot", () => {
    const store = useGameStore.getState();
    store.setSession(makeSession([makeBoss(1, 10), makeBoss(2, 20)]));
    store.setLiveHp(1, 75, 30);

    const boss = useGameStore.getState().getBoss(1);
    expect(boss).not.toBeNull();
    expect(boss?.user_hp).toBe(75);
    expect(boss?.agent_hp).toBe(30);

    // A boss with no live override keeps its snapshot HP.
    expect(useGameStore.getState().getBoss(2)?.user_hp).toBe(100);
  });

  it("getBoss returns null without a session or for an unknown boss", () => {
    expect(useGameStore.getState().getBoss(1)).toBeNull();

    useGameStore.getState().setSession(makeSession([makeBoss(1, 10)]));
    expect(useGameStore.getState().getBoss(999)).toBeNull();
  });
});

describe("gameStore optimistic messages", () => {
  it("appends then clears pending messages per boss", () => {
    const store = useGameStore.getState();
    store.appendPendingMessage(1, makeMessage(1));
    store.appendPendingMessage(1, makeMessage(2));
    store.appendPendingMessage(2, makeMessage(3));

    expect(useGameStore.getState().pendingMessages[1]).toHaveLength(2);
    expect(useGameStore.getState().pendingMessages[2]).toHaveLength(1);

    store.clearPendingMessages(1);
    expect(useGameStore.getState().pendingMessages[1]).toBeUndefined();
    expect(useGameStore.getState().pendingMessages[2]).toHaveLength(1);
  });
});
