import { create } from "zustand";
import { configApi, type AppConfig } from "../lib/api";

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
