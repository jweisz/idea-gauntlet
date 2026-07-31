import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const getMock = vi.fn();
vi.mock("../lib/api", () => ({
  configApi: { get: () => getMock() },
}));

import {
  useConfigStore,
  useGameName,
  useBossCount,
  useMaxBossCount,
  useProgression,
} from "./configStore";

const SERVER_CONFIG = {
  game_name: "Custom Name",
  auth: "local",
  google_client_id: "",
  credits_enabled: false,
  billing_enabled: false,
  show_api_key_settings: true,
  show_model_selection: true,
  leaderboard_enabled: true,
  accepting_new_players: true,
  difficulty_bosses: { easy: 3, normal: 5, difficult: 7, insane: 8 },
  difficulty_progression: {
    easy: "linear",
    normal: "linear",
    difficult: "linear",
    insane: "free",
  },
} as const;

beforeEach(() => {
  useConfigStore.setState({ config: null, error: false });
  getMock.mockReset();
});

describe("useGameName", () => {
  it("falls back to 'Idea Gauntlet' before config loads", () => {
    const { result } = renderHook(() => useGameName());
    expect(result.current).toBe("Idea Gauntlet");
  });

  it("reflects the loaded game name", () => {
    useConfigStore.setState({ config: SERVER_CONFIG });
    const { result } = renderHook(() => useGameName());
    expect(result.current).toBe("Custom Name");
  });
});

describe("gauntlet shape selectors", () => {
  it("reads boss counts from the server rather than hardcoding them", () => {
    useConfigStore.setState({ config: SERVER_CONFIG });

    expect(renderHook(() => useBossCount("easy")).result.current).toBe(3);
    expect(renderHook(() => useBossCount("normal")).result.current).toBe(5);
    expect(renderHook(() => useBossCount("difficult")).result.current).toBe(7);
    expect(renderHook(() => useBossCount("insane")).result.current).toBe(8);
    expect(renderHook(() => useMaxBossCount()).result.current).toBe(8);
  });

  it("reports which tiers are fought in order", () => {
    useConfigStore.setState({ config: SERVER_CONFIG });

    expect(renderHook(() => useProgression("normal")).result.current).toBe(
      "linear",
    );
    expect(renderHook(() => useProgression("insane")).result.current).toBe(
      "free",
    );
  });

  it("falls back to the legacy gauntlet when the backend is older", () => {
    // A backend from before this feature returns a config with neither key.
    // The screens must still be playable — an 8-boss free-choice run is
    // exactly what such a backend can create. Returning 0 here previously
    // left the challenger screen spinning forever with no request ever sent.
    const { difficulty_bosses, difficulty_progression, ...legacy } =
      SERVER_CONFIG;
    void difficulty_bosses;
    void difficulty_progression;
    useConfigStore.setState({ config: legacy as never });

    expect(renderHook(() => useBossCount("normal")).result.current).toBe(8);
    expect(renderHook(() => useMaxBossCount()).result.current).toBe(8);
    expect(renderHook(() => useProgression("normal")).result.current).toBe(
      "free",
    );
  });

  it("falls back to the legacy gauntlet before config loads", () => {
    expect(renderHook(() => useBossCount("normal")).result.current).toBe(8);
    expect(renderHook(() => useMaxBossCount()).result.current).toBe(8);
  });
});

describe("useConfigStore.load", () => {
  it("fetches once and caches the result across calls", async () => {
    getMock.mockResolvedValue(SERVER_CONFIG);

    const first = await useConfigStore.getState().load();
    const second = await useConfigStore.getState().load();

    expect(first).toEqual(SERVER_CONFIG);
    expect(second).toEqual(SERVER_CONFIG);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(useConfigStore.getState().config).toEqual(SERVER_CONFIG);
  });

  it("sets error and resolves null when the backend is unreachable", async () => {
    getMock.mockRejectedValue(new Error("unreachable"));

    const result = await useConfigStore.getState().load();

    expect(result).toBeNull();
    expect(useConfigStore.getState().error).toBe(true);
    expect(useConfigStore.getState().config).toBeNull();
  });

  it("reload() recovers after an earlier failure", async () => {
    getMock.mockRejectedValueOnce(new Error("unreachable"));
    await useConfigStore.getState().load();
    expect(useConfigStore.getState().error).toBe(true);

    getMock.mockResolvedValue(SERVER_CONFIG);
    const recovered = await useConfigStore.getState().reload();

    expect(recovered).toEqual(SERVER_CONFIG);
    expect(useConfigStore.getState().error).toBe(false);
    expect(useConfigStore.getState().config).toEqual(SERVER_CONFIG);
  });
});
