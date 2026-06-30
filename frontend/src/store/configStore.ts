import { create } from "zustand";
import { configApi, type AppConfig } from "../lib/api";

/**
 * App config (feature flags + game name) fetched once from /api/config and
 * shared across screens. `load()` dedupes concurrent callers.
 */
interface ConfigState {
  config: AppConfig | null;
  load: () => Promise<AppConfig>;
}

let inflight: Promise<AppConfig> | null = null;

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  load: () => {
    const existing = get().config;
    if (existing) return Promise.resolve(existing);
    if (!inflight) {
      inflight = configApi.get().then((c) => {
        set({ config: c });
        return c;
      });
    }
    return inflight;
  },
}));

/** Game display name, with a sensible fallback before config has loaded. */
export function useGameName(): string {
  return useConfigStore((s) => s.config?.game_name) ?? "Idea Gauntlet";
}
