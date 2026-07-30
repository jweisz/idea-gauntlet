/**
 * Picks the stage layout for a session and holds what both layouts share: the
 * "no session" bail-out and the mount refetch that keeps boss statuses fresh
 * after a battle.
 *
 * `progression` is computed by the server, never re-derived here — it encodes
 * the back-compat rule that games created before gauntlet length was variable
 * keep the free-choice grid they were built for, whatever their difficulty.
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/gameStore";
import { gauntlet } from "../lib/api";
import StageSelectScreen from "./StageSelectScreen";
import GauntletPathScreen from "./GauntletPathScreen";

export default function StageRouter() {
  const navigate = useNavigate();
  const { session, setSession } = useGameStore();
  // Don't let a slow mount-fetch overwrite a /bypass result that landed first.
  const bypassedRef = useRef(false);

  useEffect(() => {
    if (!session) {
      navigate("/", { replace: true });
      return;
    }
    gauntlet
      .getSession(session.id)
      .then((s) => {
        if (!bypassedRef.current) setSession(s);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return null;

  return session.progression === "free" ? (
    <StageSelectScreen session={session} bypassedRef={bypassedRef} />
  ) : (
    <GauntletPathScreen session={session} bypassedRef={bypassedRef} />
  );
}
