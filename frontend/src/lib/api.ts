import {
  withAuthHeaders,
  getAuthSession,
  clearAuthSession,
  disableGoogleAutoSelect,
} from "./auth";

const defaultBase = `${window.location.protocol}//${window.location.hostname}:8000`;
export const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? defaultBase;

function url(path: string) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

async function readDetail(res: Response): Promise<string> {
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await res.json()) as { detail?: string };
      if (j.detail) return j.detail;
    } else {
      const t = await res.text();
      if (t.trim()) return t.trim();
    }
  } catch {
    /* fall through */
  }
  return `Request failed with status ${res.status}`;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(url(path), withAuthHeaders(init));
}

// When a jwt (hosted) session goes stale server-side — token expired, or the
// signing secret rotated — authenticated calls come back 401. Rather than let
// the app keep rendering a logged-in shell whose data never loads, drop the
// session and bounce to sign-in. Guarded to jwt sessions so self-host/local-
// open (which never carry a token) is untouched, and latched so a burst of
// concurrent 401s triggers a single redirect.
let handlingAuthExpiry = false;
function handleAuthExpiry(): void {
  if (handlingAuthExpiry) return;
  const s = getAuthSession();
  if (!s || s.mode !== "jwt") return;
  handlingAuthExpiry = true;
  clearAuthSession();
  disableGoogleAutoSelect();
  window.location.assign("/"); // AuthGate re-evaluates → Google sign-in screen
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (res.status === 401) handleAuthExpiry();
  if (!res.ok) throw new ApiError(res.status, await readDetail(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Settings & Providers types
// ---------------------------------------------------------------------------

export interface ProviderInfo {
  provider: string;
  models: string[];
  error?: string | null;
}

export interface AppSettings {
  llm_provider: string | null;
  llm_model: string | null;
  openai_api_key: boolean;
  anthropic_api_key: boolean;
  google_api_key: boolean;
  ollama_base_url: string | null;
}

export const settingsApi = {
  get: () => apiJson<AppSettings>("/api/settings/"),
  update: (patch: Partial<AppSettings>) =>
    apiJson<void>("/api/settings/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
};

export const providersApi = {
  list: () => apiJson<ProviderInfo[]>("/api/providers/models"),
};

export interface AppConfig {
  game_name: string;
  auth: string;
  google_client_id: string;
  credits_enabled: boolean;
  billing_enabled: boolean;
  show_api_key_settings: boolean;
  show_model_selection: boolean;
  leaderboard_enabled: boolean;
  accepting_new_players: boolean;
}

export const configApi = {
  // Load the app's feature flags. Retries for a while before giving up: a
  // transient failure at startup must NOT be mistaken for "this is a self-host
  // install" — that mistake would show the model/API-key settings and skip auth.
  // The retry budget (~2.5min) is sized to outlast a free-tier host waking from
  // sleep — a cold start can take 1-2min — so the loading screen covers the
  // spin-up rather than flipping to a connection error mid-wake. Throws once the
  // backend is confirmed unreachable so the caller can surface a connection error.
  get: async (attempts = 75, delayMs = 2000): Promise<AppConfig> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await apiJson<AppConfig>("/api/config");
      } catch (e) {
        lastErr = e;
        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastErr;
  },
};

// --- Hosted-only API surface (endpoints exist only in the hosted deployment) ---

export interface AuthResult {
  access_token: string;
  token_type: string;
  user?: { email?: string; name?: string };
}

export const authApi = {
  googleSignIn: (credential: string) =>
    apiJson<AuthResult>("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    }),
};

export interface CreditsInfo {
  balance: number;
  monthly_grant: number;
  billing_enabled: boolean;
}

// Always available in the hosted deployment (config.credits_enabled), even when
// self-serve billing is off — the balance drives the coin badge.
export const creditsApi = {
  me: () => apiJson<CreditsInfo>("/api/credits/me"),
  // Dev-only top-up, called from the credits badge in dev builds. Implemented
  // by credits-enabled backends (the hosted overlay / the local stub); a
  // production build never calls it.
  devGrant: () =>
    apiJson<CreditsInfo>("/api/credits/dev-grant", { method: "POST" }),
};

export interface BillingInfo {
  credits_balance: number;
  packs: Record<string, { price_usd: number; credits: number }>;
}

export const billingApi = {
  me: () => apiJson<BillingInfo>("/api/billing/me"),
  checkout: (pack: string) =>
    apiJson<{ url: string }>("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack }),
    }),
};

// ---------------------------------------------------------------------------
// Gauntlet API types
// ---------------------------------------------------------------------------

export interface AgentSummary {
  id: number;
  name: string;
  emoji: string;
  role_description: string;
}

export interface BattleMessageOut {
  id: number;
  role: "user" | "agent";
  content: string;
  damage: number | null;
  damage_reason?: string | null;
  created_at: string;
}

export interface BattleBossOut {
  id: number;
  agent_id: number;
  status: "pending" | "active" | "defeated" | "failed";
  user_hp: number;
  agent_hp: number;
  agent: AgentSummary;
  messages: BattleMessageOut[];
}

export type Difficulty = "easy" | "normal" | "difficult";

export interface SessionOut {
  id: number;
  idea: string;
  agent_ids: string;
  status: "active" | "complete";
  difficulty: Difficulty;
  summary: string | null;
  created_at: string;
  bosses: BattleBossOut[];
}

export interface SessionListItem {
  id: number;
  idea: string;
  status: "active" | "complete";
  difficulty: Difficulty;
  has_summary: boolean;
  created_at: string;
  bosses_defeated: number;
  total_bosses: number;
}

export interface LeaderboardEntryOut {
  id: number;
  session_id: number;
  user_display_name: string;
  idea: string;
  defense_summary: string;
  defeated_bosses: string[];
  difficulty: Difficulty;
  bosses_defeated: number;
  total_bosses: number;
  avg_turns_per_boss: number;
  avg_damage_per_attack: number;
  created_at: string;
}

export interface BossSummaryEntry {
  name: string;
  summary: string;
}

export interface ObjectionEntry {
  objection: string;
  raised_by: string[];
  counterpoint: string;
}

export type IdeaCheckCategory =
  | "ok"
  | "prompt_injection"
  | "unsafe"
  | "no_position"
  | "undebatable";

export interface IdeaCheckResult {
  passed: boolean;
  category: IdeaCheckCategory;
  reason: string;
}

export interface BattleTurnOut {
  agent_reply: string;
  user_damage: number;
  user_damage_reason?: string | null;
  agent_damage: number;
  agent_damage_reason?: string | null;
  user_hp: number;
  agent_hp: number;
  battle_over: boolean;
  winner: "user" | "agent" | null;
  defeat_reason?: string | null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export const gauntlet = {
  checkIdea: (idea: string) =>
    apiJson<IdeaCheckResult>("/api/gauntlet/idea-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea }),
    }),

  randomAgents: (count = 8) =>
    apiJson<AgentSummary[]>(`/api/gauntlet/agents/random?count=${count}`),

  allAgents: () => apiJson<AgentSummary[]>("/api/agents/"),

  createSession: (
    idea: string,
    agent_ids: number[],
    difficulty: Difficulty = "normal",
  ) =>
    apiJson<SessionOut>("/api/gauntlet/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, agent_ids, difficulty }),
    }),

  listSessions: () => apiJson<SessionListItem[]>("/api/gauntlet/sessions"),

  getSession: (id: number) =>
    apiJson<SessionOut>(`/api/gauntlet/sessions/${id}`),

  deleteSession: (id: number) =>
    apiJson<{ status: string }>(`/api/gauntlet/sessions/${id}`, {
      method: "DELETE",
    }),

  getBattleOpening: (session_id: number, boss_id: number) =>
    apiJson<{ agent_reply: string }>(
      `/api/gauntlet/sessions/${session_id}/battles/${boss_id}/opening`,
      {
        method: "POST",
      },
    ),

  sendMessage: (session_id: number, boss_id: number, content: string) =>
    apiJson<BattleTurnOut>(
      `/api/gauntlet/sessions/${session_id}/battles/${boss_id}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      },
    ),

  retryBattle: (session_id: number, boss_id: number) =>
    apiJson<{ ok: boolean }>(
      `/api/gauntlet/sessions/${session_id}/battles/${boss_id}/retry`,
      {
        method: "POST",
      },
    ),

  bypassBattle: (session_id: number, boss_id: number) =>
    apiJson<BattleTurnOut>(
      `/api/gauntlet/sessions/${session_id}/battles/${boss_id}/bypass`,
      {
        method: "POST",
      },
    ),

  generateSummary: (session_id: number) =>
    apiJson<{ summary: string }>(
      `/api/gauntlet/sessions/${session_id}/summary`,
      { method: "POST" },
    ),

  bossSummary: (session_id: number, boss_id: number) =>
    apiJson<BossSummaryEntry>(
      `/api/gauntlet/sessions/${session_id}/summary/boss/${boss_id}`,
      { method: "POST" },
    ),

  objectionsSummary: (session_id: number) =>
    apiJson<{ objections: ObjectionEntry[] }>(
      `/api/gauntlet/sessions/${session_id}/summary/objections`,
      { method: "POST" },
    ),

  storeSummary: (session_id: number, data: string) =>
    apiJson<{ summary: string }>(
      `/api/gauntlet/sessions/${session_id}/summary`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      },
    ),

  publish: (session_id: number) =>
    apiJson<LeaderboardEntryOut>(
      `/api/gauntlet/sessions/${session_id}/publish`,
      { method: "POST" },
    ),

  unpublish: (session_id: number) =>
    apiJson<{ status: string }>(
      `/api/gauntlet/sessions/${session_id}/publish`,
      { method: "DELETE" },
    ),
};

export const leaderboardApi = {
  list: (limit = 50, offset = 0) =>
    apiJson<LeaderboardEntryOut[]>(
      `/api/leaderboard?limit=${limit}&offset=${offset}`,
    ),
};

export const waitlistApi = {
  // Endpoint is provided by the hosted overlay; self-host never shows the form.
  signup: (email: string) =>
    apiJson<{ status: string }>("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }),
};
