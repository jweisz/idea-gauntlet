import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StageRouter from "./StageRouter";
import { gauntlet, type SessionOut } from "../lib/api";
import { useGameStore } from "../store/gameStore";

function session(
  progression: SessionOut["progression"],
  bossCount: number,
): SessionOut {
  return {
    id: 1,
    idea: "Candy is bad",
    agent_ids: "[]",
    status: "active",
    difficulty: progression === "free" ? "insane" : "normal",
    summary: null,
    created_at: new Date().toISOString(),
    progression,
    bosses: Array.from({ length: bossCount }, (_, i) => ({
      id: i + 1,
      agent_id: i + 1,
      status: "pending" as const,
      user_hp: 100,
      agent_hp: 100,
      agent: {
        id: i + 1,
        name: `Critic ${i + 1}`,
        emoji: "🤖",
        role_description: "critic",
      },
      messages: [],
    })),
  };
}

beforeEach(() => {
  vi.spyOn(gauntlet, "getSession").mockImplementation(
    () => new Promise(() => {}), // never resolves; keep the seeded session
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  useGameStore.setState({ session: null });
});

function renderWith(s: SessionOut) {
  useGameStore.setState({ session: s });
  return render(
    <MemoryRouter>
      <StageRouter />
    </MemoryRouter>,
  );
}

describe("StageRouter", () => {
  it("shows the linear path for an in-order run", async () => {
    renderWith(session("linear", 3));

    expect(await screen.findByText("THE GAUNTLET")).toBeTruthy();
    expect(screen.getByText("0/3 DEFEATED")).toBeTruthy();
    // Only the first boss is playable; the rest are locked but still named.
    expect(screen.getAllByTestId("path-node-next").length).toBe(1);
    expect(screen.getAllByTestId("path-node-locked").length).toBe(2);
    expect(screen.getByText("Critic 3")).toBeTruthy();
  });

  it("shows the free-choice grid for a free run", async () => {
    renderWith(session("free", 8));

    expect(await screen.findByText("STAGE SELECT")).toBeTruthy();
    expect(screen.getByText("0/8 DEFEATED")).toBeTruthy();
    expect(screen.getByText("DEFEAT ALL 8")).toBeTruthy();
  });

  it("keeps a pre-existing 8-boss game on the grid it was built for", async () => {
    // The production back-compat case: an old "normal" save has 8 bosses and
    // free choice. The server says so via `progression`; the router must not
    // second-guess it from the difficulty.
    const legacy = { ...session("free", 8), difficulty: "normal" as const };

    renderWith(legacy);

    expect(await screen.findByText("STAGE SELECT")).toBeTruthy();
    expect(screen.queryByText("THE GAUNTLET")).toBeNull();
  });

  it("refetches on mount so boss statuses are fresh after a battle", async () => {
    renderWith(session("linear", 3));

    await waitFor(() => expect(gauntlet.getSession).toHaveBeenCalledWith(1));
  });
});
