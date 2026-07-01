import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  gauntlet,
  ApiError,
  type AgentSummary,
  type Difficulty,
} from "../lib/api";
import { useGameStore } from "../store/gameStore";
import { useChiptune } from "../hooks/useChiptune";
import CreditsBadge from "../components/CreditsBadge";

const CENTER_POS = 4;
const MAX_REROLLS = 2;

const BOSS_COLORS = [
  "var(--nes-blue)",
  "var(--nes-red)",
  "var(--nes-green)",
  "var(--nes-orange)",
  "var(--nes-purple)",
  "var(--nes-cyan)",
  "var(--nes-yellow)",
  "var(--nes-gray)",
];

function gridPosToBossIndex(pos: number): number {
  return pos < CENTER_POS ? pos : pos - 1;
}

export default function ChallengerSelectScreen() {
  const navigate = useNavigate();
  const { blip, attack } = useChiptune();
  const { pendingIdea, pendingAgents, setPendingAgents, setSession } =
    useGameStore();

  const [loading, setLoading] = useState(pendingAgents.length === 0);
  const [starting, setStarting] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  const rerollsLeft = MAX_REROLLS - rerollsUsed;

  useEffect(() => {
    if (!pendingIdea) {
      navigate("/", { replace: true });
      return;
    }
    // loading's initial value already accounts for pendingAgents being
    // pre-populated (a reroll/back-navigation case), so only fetch when empty.
    if (pendingAgents.length > 0) return;
    gauntlet
      .randomAgents(8)
      .then(setPendingAgents)
      .catch(() => setError("Failed to load agents. Is the backend running?"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = async () => {
    if (pendingAgents.length !== 8 || starting || loading || rerolling) return;
    setError(null);
    setStarting(true);
    attack();
    try {
      const session = await gauntlet.createSession(
        pendingIdea,
        pendingAgents.map((a) => a.id),
        undefined,
        difficulty,
      );
      setSession(session);
      navigate("/stage-select");
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setOutOfCredits(true);
      } else if (e instanceof ApiError && e.status === 503) {
        navigate("/waitlist");
      } else {
        setError(e instanceof Error ? e.message : "Failed to start session");
      }
      setStarting(false);
    }
  };

  const handleReroll = async () => {
    if (rerollsLeft <= 0 || rerolling || loading || starting) return;
    setError(null);
    setRerolling(true);
    blip();
    try {
      const fresh = await gauntlet.randomAgents(8);
      setPendingAgents(fresh);
      setRerollsUsed((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reroll challengers");
    } finally {
      setRerolling(false);
    }
  };

  // Build 3×3 grid: positions 0-3 → bosses 0-3, pos 4 = center, pos 5-8 → bosses 4-7
  const gridItems: (AgentSummary | "center" | undefined)[] = [
    pendingAgents[0],
    pendingAgents[1],
    pendingAgents[2],
    pendingAgents[3],
    "center",
    pendingAgents[4],
    pendingAgents[5],
    pendingAgents[6],
    pendingAgents[7],
  ];

  return (
    <div className="screen" style={{ gap: 24 }}>
      <div style={{ textAlign: "center" }}>
        <h1
          className="text-cyan"
          style={{ fontSize: "1rem", marginBottom: 12 }}
        >
          CHOOSE YOUR CHALLENGERS
        </h1>
        <div
          style={{
            fontSize: "0.5rem",
            color: "var(--nes-gray)",
            letterSpacing: 1,
            marginBottom: 4,
          }}
        >
          YOUR IDEA
        </div>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--nes-yellow)",
            lineHeight: 1.6,
            maxWidth: 680,
            margin: "0 auto",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          "{pendingIdea}"
        </p>
      </div>

      {/* Difficulty picker */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          width: "min(680px, 100%)",
        }}
      >
        <span
          style={{
            fontSize: "0.55rem",
            color: "var(--nes-gray)",
            alignSelf: "flex-start",
          }}
        >
          DIFFICULTY:
        </span>
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          {(
            [
              {
                id: "easy" as Difficulty,
                label: "EASY",
                color: "var(--nes-green)",
                hint: "hit harder · take less damage",
              },
              {
                id: "normal" as Difficulty,
                label: "NORMAL",
                color: "var(--nes-yellow)",
                hint: "fair and balanced debate",
              },
              {
                id: "difficult" as Difficulty,
                label: "DIFFICULT",
                color: "var(--nes-red)",
                hint: "try your best!",
              },
            ] as const
          ).map(({ id, label, color, hint }) => {
            const active = difficulty === id;
            return (
              <button
                key={id}
                onClick={() => {
                  blip();
                  setDifficulty(id);
                }}
                style={{
                  flex: 1,
                  background: active ? color : "var(--nes-darkgray)",
                  border: `3px solid ${active ? color : "var(--nes-gray)"}`,
                  boxShadow: active ? `3px 3px 0 rgba(0,0,0,0.4)` : "none",
                  color: active ? "var(--nes-black)" : "var(--nes-gray)",
                  fontFamily: "inherit",
                  fontSize: "0.6rem",
                  padding: "8px 12px",
                  cursor: "pointer",
                  transition: "all 80ms",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>{label}</span>
                <span
                  style={{ fontSize: "0.45rem", opacity: active ? 0.8 : 0.4 }}
                >
                  {hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: "0.875rem", color: "var(--nes-gray)" }}>
          LOADING AGENTS...
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            width: "min(680px, 100%)",
          }}
        >
          {gridItems.map((item, pos) => {
            // ── Centre tile — the reroll button, standing in for "your idea" ──
            if (item === "center") {
              const rerollDisabled = rerollsLeft <= 0 || rerolling || starting;
              return (
                <button
                  key="center"
                  type="button"
                  className="pixel-btn"
                  onClick={() => void handleReroll()}
                  disabled={rerollDisabled}
                  title={`Reroll all challengers · ${MAX_REROLLS} per game`}
                  style={{
                    aspectRatio: "1",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    borderColor: "var(--nes-white)",
                    boxShadow: "4px 4px 0 rgba(255,255,255,0.15)",
                    opacity: rerollsLeft <= 0 ? 0.4 : 1,
                    cursor: rerollDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  <div
                    className={`sprite ${rerolling ? "" : "sprite--idle"}`}
                    style={{ fontSize: 36 }}
                  >
                    🎲
                  </div>
                  <div style={{ fontSize: "0.65rem", lineHeight: 1.6 }}>
                    {rerolling ? "REROLLING..." : "REROLL"}
                  </div>
                  <div
                    style={{ fontSize: "0.5rem", color: "var(--nes-yellow)" }}
                  >
                    {rerollsLeft}x LEFT
                  </div>
                </button>
              );
            }

            // ── Boss tile (display-only) ─────────────────────────────────
            const agent = item as AgentSummary | undefined;
            if (!agent) return <div key={`empty-${pos}`} />;

            const bossIdx = gridPosToBossIndex(pos);
            const color = BOSS_COLORS[bossIdx % BOSS_COLORS.length];

            return (
              // Keyed by grid position, not agent id: a reroll swaps most/all
              // 8 agents at once, and keying by id would remount every tile
              // that changed, killing the opacity transition mid-flight and
              // popping the new content in instantly (the "flash"). Keying by
              // position keeps the same DOM node across a reroll so its
              // emoji/name just update in place and the fade stays smooth.
              <div
                key={pos}
                style={{
                  border: `4px solid ${color}`,
                  boxShadow: `4px 4px 0 ${color}`,
                  background: "var(--nes-darkgray)",
                  aspectRatio: "1",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: 12,
                  position: "relative",
                  overflow: "hidden",
                  opacity: rerolling ? 0.5 : 1,
                  transition: "transform 80ms, box-shadow 80ms, opacity 120ms",
                }}
              >
                <div className="sprite sprite--idle" style={{ fontSize: 36 }}>
                  {agent.emoji}
                </div>
                <div
                  style={{
                    fontSize: "0.65rem",
                    lineHeight: 1.6,
                    textAlign: "center",
                    width: "100%",
                    overflowWrap: "break-word",
                  }}
                >
                  {agent.name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p style={{ color: "var(--nes-red)", fontSize: "0.875rem" }}>{error}</p>
      )}

      {outOfCredits && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "center",
          }}
        >
          <p style={{ color: "var(--nes-yellow)", fontSize: "0.8rem" }}>
            You're out of credits.
          </p>
          <CreditsBadge openOnMount />
        </div>
      )}

      {!loading && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 12,
            width: "min(680px, 100%)",
          }}
        >
          <button
            className="pixel-btn"
            style={{
              fontSize: "0.8rem",
              padding: "12px 20px",
              whiteSpace: "nowrap",
            }}
            onClick={() => {
              blip();
              navigate("/");
            }}
          >
            <span className="pixel-arrow">◀</span> BACK
          </button>
          <button
            className="pixel-btn pixel-btn--green"
            onClick={() => void handleStart()}
            disabled={starting || rerolling}
            style={{
              fontSize: "0.85rem",
              padding: "14px 22px",
              whiteSpace: "nowrap",
            }}
          >
            {starting ? (
              "..."
            ) : (
              <>
                <span className="pixel-arrow">▶</span> ENTER THE GAUNTLET
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
