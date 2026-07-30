import { describe, expect, it } from "vitest";
import { gauntletProgress } from "./gauntletProgress";
import type { BattleBossOut } from "./api";

function bosses(...statuses: BattleBossOut["status"][]): BattleBossOut[] {
  return statuses.map((status, i) => ({
    id: i + 1,
    agent_id: i + 1,
    status,
    user_hp: 100,
    agent_hp: 100,
    agent: {
      id: i + 1,
      name: `Critic ${i}`,
      emoji: "🤖",
      role_description: "",
    },
    messages: [],
  }));
}

describe("gauntletProgress", () => {
  it("points at the first boss of a fresh run", () => {
    expect(
      gauntletProgress(bosses("pending", "pending", "pending")).nextIndex,
    ).toBe(0);
  });

  it("advances past defeated bosses", () => {
    expect(
      gauntletProgress(bosses("defeated", "pending", "pending")).nextIndex,
    ).toBe(1);
  });

  it("treats a lost battle as the next one to fight, not a dead end", () => {
    // A failed boss resets itself when re-entered, so it stays "next".
    expect(gauntletProgress(bosses("failed", "pending")).nextIndex).toBe(0);
  });

  it("stays on a battle already in progress", () => {
    expect(gauntletProgress(bosses("active", "pending")).nextIndex).toBe(0);
  });

  it("reports a finished run", () => {
    const p = gauntletProgress(bosses("defeated", "defeated"));
    expect(p.nextIndex).toBe(-1);
    expect(p.allDefeated).toBe(true);
    expect(p.defeatedCount).toBe(2);
  });

  it("handles bosses defeated out of order", () => {
    // Possible on a free-choice run, and on any game created before gauntlet
    // length was variable. The count must still be right and the next boss must
    // be the first un-defeated one, not simply the one after the last win.
    const p = gauntletProgress(bosses("pending", "defeated", "pending"));
    expect(p.nextIndex).toBe(0);
    expect(p.defeatedCount).toBe(1);
    expect(p.allDefeated).toBe(false);
  });

  it("counts the roster it is given, whatever the difficulty says", () => {
    expect(gauntletProgress(bosses(...Array(8).fill("pending"))).total).toBe(8);
    expect(gauntletProgress([]).allDefeated).toBe(false);
  });
});
