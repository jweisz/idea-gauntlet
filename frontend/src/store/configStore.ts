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
// /api/config. These selectors are the only way the UI learns it — the numbers
// are deliberately not duplicated here. AuthGate blocks every screen until
// config resolves, so the pre-load fallbacks below are unreachable in practice;
// they exist so a caller can't crash on a null config.

/** How many critics a gauntlet at this difficulty has. 0 before config loads. */
export function useBossCount(difficulty: Difficulty): number {
  return useConfigStore((s) => s.config?.difficulty_bosses?.[difficulty]) ?? 0;
}

/** The longest gauntlet on offer — how many challengers to fetch up front. */
export function useMaxBossCount(): number {
  const counts = useConfigStore((s) => s.config?.difficulty_bosses);
  return counts ? Math.max(...Object.values(counts)) : 0;
}

/** Whether this difficulty is fought in order or lets you pick any boss. */
export function useProgression(difficulty: Difficulty): Progression {
  return (
    useConfigStore((s) => s.config?.difficulty_progression?.[difficulty]) ??
    "linear"
  );
}
