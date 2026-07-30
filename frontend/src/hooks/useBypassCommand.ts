/**
 * State and behavior for the hidden "/bypass" dev command on the stage screens:
 * press "/" to open a prompt, type "/bypass" to defeat every remaining boss.
 *
 * Shared by both stage layouts (the free-choice grid and the linear path) so
 * the two can't drift apart. The panel UI lives in
 * components/BypassCommandPanel.
 */
import { useEffect, useRef, useState } from "react";
import { gauntlet } from "../lib/api";
import type { SessionOut } from "../lib/api";

export function useBypassCommand(
  session: SessionOut | null,
  setSession: (s: SessionOut) => void,
  /**
   * Owned by the caller that also issues the mount refetch (StageRouter), so a
   * slow refetch can't overwrite a bypass result that landed while it was in
   * flight. A ref local to this hook would be a different cell from the one the
   * refetch checks, and the guard would silently do nothing.
   */
  bypassedRef: React.MutableRefObject<boolean>,
) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("/");
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Open the panel on "/" (when it isn't already open and we're not typing).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (open || running) return;
      if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setValue("/");
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, running]);

  // Focus the input whenever the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setValue("/");
  };

  const run = async () => {
    const cmd = value.trim();
    close();
    if (cmd !== "/bypass" || !session) return;

    setRunning(true);
    bypassedRef.current = true;
    try {
      const toBypass = session.bosses.filter((b) => b.status !== "defeated");
      for (const boss of toBypass) {
        await gauntlet.bypassBattle(session.id, boss.id);
      }
      // Patch locally first so the screen updates without a round-trip.
      setSession({
        ...session,
        bosses: session.bosses.map((b) => ({
          ...b,
          status: "defeated" as const,
          agent_hp: 0,
        })),
      });
      // Confirm with server in background.
      gauntlet
        .getSession(session.id)
        .then(setSession)
        .catch(() => {});
    } finally {
      setRunning(false);
    }
  };

  return { open, value, setValue, running, inputRef, close, run };
}

export type BypassCommand = ReturnType<typeof useBypassCommand>;
