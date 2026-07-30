import type { BattleBossOut } from "./api";

export interface GauntletProgress {
  total: number;
  defeatedCount: number;
  allDefeated: boolean;
  /** Index of the only boss playable in a linear run; -1 once all are down. */
  nextIndex: number;
}

/**
 * Derive a run's progress from its bosses.
 *
 * `total` comes from the roster itself and never from the difficulty: an
 * existing 8-boss game whose tier now says 5 must still be counted as 8.
 *
 * `nextIndex` is the first boss that isn't defeated, which covers pending,
 * active and failed alike — a failed battle resets itself when re-entered, so
 * it is simply the next one to fight rather than a dead end. Bosses defeated
 * out of order (possible on a free-choice run, and on any legacy game) are
 * skipped correctly because the test is per-boss status, not position.
 */
export function gauntletProgress(bosses: BattleBossOut[]): GauntletProgress {
  const total = bosses.length;
  const defeatedCount = bosses.filter((b) => b.status === "defeated").length;
  return {
    total,
    defeatedCount,
    allDefeated: total > 0 && defeatedCount === total,
    nextIndex: bosses.findIndex((b) => b.status !== "defeated"),
  };
}
