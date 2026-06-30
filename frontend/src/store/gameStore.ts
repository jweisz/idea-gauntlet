import { create } from "zustand";
import type {
  SessionOut,
  BattleBossOut,
  BattleMessageOut,
  AgentSummary,
} from "../lib/api";

interface GameState {
  // Idea typed on screen 1, carried to screen 2
  pendingIdea: string;
  setPendingIdea: (idea: string) => void;

  // Current session loaded from the API
  session: SessionOut | null;
  setSession: (s: SessionOut) => void;
  clearSession: () => void;

  // Which boss is currently being fought (by boss id)
  activeBossId: number | null;
  setActiveBossId: (id: number | null) => void;

  // Pending agents for the IdeaEntry customization panel
  pendingAgents: AgentSummary[];
  setPendingAgents: (agents: AgentSummary[]) => void;
  swapPendingAgent: (index: number, replacement: AgentSummary) => void;

  // Per-slot LLM model overrides (slot 0-7 → { provider, model })
  pendingAgentModels: Record<number, { provider: string; model: string }>;
  setPendingAgentModel: (
    slotIndex: number,
    provider: string,
    model: string,
  ) => void;
  clearPendingAgentModel: (slotIndex: number) => void;
  setAllPendingAgentModels: (provider: string, model: string) => void;

  // Live HP overrides during battle (updated before the API response is committed)
  liveHp: Record<number, { userHp: number; agentHp: number }>;
  setLiveHp: (bossId: number, userHp: number, agentHp: number) => void;

  // Optimistic message append before re-fetching full session
  pendingMessages: Record<number, BattleMessageOut[]>;
  appendPendingMessage: (bossId: number, msg: BattleMessageOut) => void;
  clearPendingMessages: (bossId: number) => void;

  // Helper: derive boss state (merged live HP)
  getBoss: (bossId: number) => BattleBossOut | null;
}

export const useGameStore = create<GameState>((set, get) => ({
  pendingIdea: "",
  setPendingIdea: (idea) => set({ pendingIdea: idea }),

  session: null,
  setSession: (s) => {
    localStorage.setItem("gauntlet_session_id", String(s.id));
    set({ session: s });
  },
  clearSession: () => {
    localStorage.removeItem("gauntlet_session_id");
    set({
      session: null,
      activeBossId: null,
      liveHp: {},
      pendingMessages: {},
      pendingIdea: "",
    });
  },

  activeBossId: null,
  setActiveBossId: (id) => set({ activeBossId: id }),

  pendingAgents: [],
  setPendingAgents: (agents) => set({ pendingAgents: agents }),
  swapPendingAgent: (index, replacement) =>
    set((state) => {
      const next = [...state.pendingAgents];
      next[index] = replacement;
      return { pendingAgents: next };
    }),

  pendingAgentModels: {},
  setPendingAgentModel: (slotIndex, provider, model) =>
    set((state) => ({
      pendingAgentModels: {
        ...state.pendingAgentModels,
        [slotIndex]: { provider, model },
      },
    })),
  clearPendingAgentModel: (slotIndex) =>
    set((state) => {
      const next = { ...state.pendingAgentModels };
      delete next[slotIndex];
      return { pendingAgentModels: next };
    }),
  setAllPendingAgentModels: (provider, model) =>
    set(() => ({
      pendingAgentModels: Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [i, { provider, model }]),
      ),
    })),

  liveHp: {},
  setLiveHp: (bossId, userHp, agentHp) =>
    set((state) => ({
      liveHp: { ...state.liveHp, [bossId]: { userHp, agentHp } },
    })),

  pendingMessages: {},
  appendPendingMessage: (bossId, msg) =>
    set((state) => ({
      pendingMessages: {
        ...state.pendingMessages,
        [bossId]: [...(state.pendingMessages[bossId] ?? []), msg],
      },
    })),
  clearPendingMessages: (bossId) =>
    set((state) => {
      const next = { ...state.pendingMessages };
      delete next[bossId];
      return { pendingMessages: next };
    }),

  getBoss: (bossId) => {
    const { session, liveHp } = get();
    if (!session) return null;
    const boss = session.bosses.find((b) => b.id === bossId) ?? null;
    if (!boss) return null;
    const hp = liveHp[bossId];
    if (!hp) return boss;
    return { ...boss, user_hp: hp.userHp, agent_hp: hp.agentHp };
  },
}));
