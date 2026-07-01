import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const getMock = vi.fn();
vi.mock("../lib/api", () => ({
  configApi: { get: () => getMock() },
}));

import { useConfigStore, useGameName } from "./configStore";

const SERVER_CONFIG = {
  game_name: "Custom Name",
  auth: "local",
  google_client_id: "",
  billing_enabled: false,
  show_api_key_settings: true,
  show_model_selection: true,
  leaderboard_enabled: true,
  accepting_new_players: true,
};

beforeEach(() => {
  useConfigStore.setState({ config: null });
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
});
