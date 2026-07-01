import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  gauntlet,
  configApi,
  ApiError,
  type SessionListItem,
} from "../lib/api";
import { useGameStore } from "../store/gameStore";
import { useChiptune } from "../hooks/useChiptune";
import { useGameName } from "../store/configStore";
import CreditsBadge from "../components/CreditsBadge";
import { useLlmConfigured } from "../hooks/useLlmConfigured";
import { useUIStore } from "../store/uiStore";

/**
 * Your Games — the landing screen.
 *
 * Replaces the old "always start a new game" behavior: paying players keep their
 * progress, so we list all of a user's games here. They can resume an
 * in-progress game, revisit a completed game's summary, or start a new one.
 */
export default function HomeScreen() {
  const navigate = useNavigate();
  const { blip, attack, hurt } = useChiptune();
  const { setSession, clearSession } = useGameStore();
  const gameName = useGameName();
  const llmConfigured = useLlmConfigured();
  const openSettings = useUIStore((s) => s.openSettings);

  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(false);
  const [acceptingNewPlayers, setAcceptingNewPlayers] = useState(true);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [revealedId, setRevealedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionListItem | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    gauntlet
      .listSessions()
      .then(setSessions)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.detail : "Failed to load your games",
        ),
      );
    configApi.get().then((c) => {
      setLeaderboardEnabled(c.leaderboard_enabled);
      setAcceptingNewPlayers(c.accepting_new_players);
      setBillingEnabled(c.billing_enabled);
    });
  }, []);

  const startNew = () => {
    if (!acceptingNewPlayers) {
      blip();
      navigate("/waitlist");
      return;
    }
    attack();
    clearSession();
    navigate("/new");
  };

  const openSession = async (item: SessionListItem) => {
    blip();
    setLoadingId(item.id);
    try {
      const full = await gauntlet.getSession(item.id);
      setSession(full);
      navigate(item.status === "complete" ? "/summary" : "/stage-select");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Failed to open that game");
      setLoadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    hurt();
    setDeleting(true);
    try {
      await gauntlet.deleteSession(deleteTarget.id);
      setSessions(
        (prev) => prev?.filter((s) => s.id !== deleteTarget.id) ?? prev,
      );
      setRevealedId(null);
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Failed to delete that game");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="screen"
      style={{
        gap: 32,
        maxWidth: 720,
        margin: "0 auto",
        width: "100%",
        padding: "40px 24px",
      }}
    >
      {billingEnabled && (
        <div style={{ alignSelf: "flex-end" }}>
          <CreditsBadge />
        </div>
      )}

      <div style={{ textAlign: "center" }}>
        <h1
          className="text-cyan animate-glow"
          style={{ fontSize: "2rem", marginBottom: 16, letterSpacing: 4 }}
        >
          {gameName.toUpperCase()}
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--nes-gray)",
            lineHeight: 2,
          }}
        >
          DEFEND YOUR IDEA AGAINST 8 CRITICS
        </p>
      </div>

      {llmConfigured === "unconfigured" ? (
        <div
          className="pixel-box pixel-box--cyan"
          style={{
            width: "100%",
            maxWidth: 420,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            padding: "24px 20px",
          }}
        >
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--nes-cyan)",
              lineHeight: 1.8,
            }}
          >
            Want to play? Configure your AI model in Settings.
          </p>
          <button
            className="pixel-btn"
            style={{
              fontSize: "0.85rem",
              padding: "14px 32px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            onClick={openSettings}
          >
            <span style={{ fontSize: "1.3em" }}>⚙️</span>
            CONFIGURE
          </button>
        </div>
      ) : (
        <button
          className="pixel-btn pixel-btn--green"
          style={{ fontSize: "1rem", padding: "18px 48px" }}
          onClick={startNew}
        >
          {acceptingNewPlayers ? "＋ NEW GAME" : "🔔 JOIN WAITLIST"}
        </button>
      )}

      {leaderboardEnabled && (
        <button
          className="pixel-btn"
          style={{ fontSize: "0.8rem", padding: "12px 32px" }}
          onClick={() => {
            blip();
            navigate("/leaderboard");
          }}
        >
          🏆 LEADERBOARD
        </button>
      )}

      {(error || (sessions && sessions.length > 0)) && (
        <div style={{ width: "100%" }}>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--nes-gray)",
              marginBottom: 12,
            }}
          >
            YOUR GAMES
          </p>

          {error && (
            <p style={{ fontSize: "0.75rem", color: "var(--nes-red)" }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessions?.map((s) => {
              const done = s.status === "complete";
              const revealed = revealedId === s.id;
              return (
                <div key={s.id} style={{ display: "flex", gap: 8 }}>
                  <button
                    className="pixel-btn"
                    disabled={loadingId === s.id}
                    style={{
                      flex: "1 1 auto",
                      minWidth: 0,
                      overflow: "hidden",
                      fontSize: "0.75rem",
                      padding: "12px 14px",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      opacity: loadingId === s.id ? 0.5 : 1,
                    }}
                    onClick={() => {
                      blip();
                      setRevealedId(revealed ? null : s.id);
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span className="pixel-arrow">▶</span> {s.idea}
                    </span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: "0.625rem",
                        color: done ? "var(--nes-green)" : "var(--nes-yellow)",
                        letterSpacing: 1,
                      }}
                    >
                      {done ? "COMPLETE" : "IN PROGRESS"} ·{" "}
                      {s.difficulty.toUpperCase()} · {s.bosses_defeated}/
                      {s.total_bosses} DEFEATED
                      {loadingId === s.id ? " · OPENING…" : ""}
                    </span>
                  </button>

                  {revealed && (
                    <>
                      <button
                        className="pixel-btn"
                        disabled={loadingId === s.id}
                        title="Delete"
                        style={{
                          flexShrink: 0,
                          width: 52,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.1rem",
                          padding: "12px 0",
                          background: "rgba(214,40,40,0.15)",
                          borderColor: "var(--nes-red)",
                          boxShadow: "4px 4px 0 var(--nes-red)",
                        }}
                        onClick={() => {
                          blip();
                          setDeleteTarget(s);
                        }}
                      >
                        🗑
                      </button>
                      <button
                        className="pixel-btn pixel-btn--green"
                        disabled={loadingId === s.id}
                        title="Resume"
                        style={{
                          flexShrink: 0,
                          width: 52,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1rem",
                          padding: "12px 0",
                        }}
                        onClick={() => openSession(s)}
                      >
                        <span className="pixel-arrow">▶</span>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            style={{
              background: "var(--nes-darkgray)",
              border: "4px solid var(--nes-red)",
              boxShadow: "6px 6px 0 var(--nes-red)",
              padding: "28px 32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              textAlign: "center",
              maxWidth: 420,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "2rem" }}>🗑</div>
            <h2 style={{ fontSize: "0.85rem", color: "var(--nes-red)" }}>
              DELETE THIS GAME?
            </h2>
            <p
              style={{
                fontSize: "0.6rem",
                color: "var(--nes-gray)",
                lineHeight: 1.8,
              }}
            >
              "{deleteTarget.idea}"
              <br />
              This can't be undone.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="pixel-btn pixel-btn--red"
                style={{ fontSize: "0.7rem" }}
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? "DELETING…" : "DELETE"}
              </button>
              <button
                className="pixel-btn"
                style={{ fontSize: "0.7rem" }}
                disabled={deleting}
                onClick={() => {
                  blip();
                  setDeleteTarget(null);
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
