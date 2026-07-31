import { create } from "zustand";
import {
  configApi,
  type AppConfig,
  type Difficulty,
  type Progression,
} from "../lib/api";

/**
 * App config (feature flags + game name) fetched once from /api/config and
 * shared across screens. `load()` dedupes concurrent callers. If the backend is
 * unreachable (after retries) it resolves to `null` and sets `error`, so the app
 * can show a connection error rather than guessing a mode; `reload()` retries.
 */
interface ConfigState {
  config: AppConfig | null;
  error: boolean;
  load: () => Promise<AppConfig | null>;
  reload: () => Promise<AppConfig | null>;
}

let inflight: Promise<AppConfig | null> | null = null;

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  error: false,
  load: () => {
    const existing = get().config;
    if (existing) return Promise.resolve(existing);
    if (!inflight) {
      inflight = configApi
        .get()
        .then((c) => {
          set({ config: c, error: false });
          return c;
        })
        .catch(() => {
          // Confirmed unreachable: surface an error instead of guessing.
          set({ error: true });
          return null;
        })
        .finally(() => {
          inflight = null; // let a later load()/reload() try again
        });
    }
    return inflight;
  },
  reload: () => {
    set({ config: null, error: false });
    inflight = null;
    return get().load();
  },
}));

/** Game display name, with a sensible fallback before config has loaded. */
export function useGameName(): string {
  return useConfigStore((s) => s.config?.game_name) ?? "Idea Gauntlet";
}

// The gauntlet's shape lives in the backend's config.toml and is served via
// /api/config; these selectors are the only way the UI learns it, so the real
// numbers are deliberately not duplicated here.
//
// The fallbacks below describe the game as it was before length became
// variable: 8 critics, fought in any order. They matter during a rolling deploy
// (or against a backend that hasn't picked up the change yet), where the keys
// are simply absent. Degrading to the old game is both playable and correct —
// an older backend only knows how to create 8-boss free-choice runs — whereas
// falling back to 0 bricked the challenger screen on a spinner that never
// resolved, because nothing ever fetched.
const LEGACY_BOSSES = 8;
const LEGACY_PROGRESSION: Progression = "free";

let warned = false;
function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    "[config] /api/config has no difficulty_bosses/difficulty_progression — " +
      "falling back to a legacy 8-boss free-choice gauntlet. The backend is " +
      "probably older than the frontend.",
  );
}

/** How many critics a gauntlet at this difficulty has. */
export function useBossCount(difficulty: Difficulty): number {
  const count = useConfigStore(
    (s) => s.config?.difficulty_bosses?.[difficulty],
  );
  const loaded = useConfigStore((s) => !!s.config);
  if (loaded && count === undefined) warnOnce();
  return count ?? LEGACY_BOSSES;
}

/** The longest gauntlet on offer — how many challengers to fetch up front. */
export function useMaxBossCount(): number {
  const counts = useConfigStore((s) => s.config?.difficulty_bosses);
  const values = counts ? Object.values(counts) : [];
  return values.length ? Math.max(...values) : LEGACY_BOSSES;
}

/** Whether this difficulty is fought in order or lets you pick any boss. */
export function useProgression(difficulty: Difficulty): Progression {
  return (
    useConfigStore((s) => s.config?.difficulty_progression?.[difficulty]) ??
    LEGACY_PROGRESSION
  );
}
