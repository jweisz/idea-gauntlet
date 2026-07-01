import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  gauntlet,
  providersApi,
  ApiError,
  type AgentSummary,
  type Difficulty,
  type ProviderInfo,
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

const selectStyle: React.CSSProperties = {
  background: "var(--nes-darkgray)",
  border: "2px solid var(--nes-gray)",
  color: "var(--nes-white)",
  fontFamily: "inherit",
  fontSize: "0.55rem",
  padding: "4px 6px",
  cursor: "pointer",
  outline: "none",
  minWidth: 80,
};

export default function ChallengerSelectScreen() {
  const navigate = useNavigate();
  const { blip, attack } = useChiptune();
  const {
    pendingIdea,
    pendingAgents,
    setPendingAgents,
    setSession,
    pendingAgentModels,
    setAllPendingAgentModels,
  } = useGameStore();

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(pendingAgents.length === 0);
  const [starting, setStarting] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  // Mass-set model state
  const [massProvider, setMassProvider] = useState("");
  const [massModel, setMassModel] = useState("");

  const rerollsLeft = MAX_REROLLS - rerollsUsed;

  useEffect(() => {
    if (!pendingIdea) {
      navigate("/", { replace: true });
      return;
    }
    const fetchRandom =
      pendingAgents.length === 0
        ? gauntlet.randomAgents(8)
        : Promise.resolve(null);
    const fetchProviders = providersApi.list();
    Promise.all([fetchRandom, fetchProviders])
      .then(([random, provList]) => {
        if (random) setPendingAgents(random);
        setProviders(provList);
      })
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
      const overrides =
        Object.keys(pendingAgentModels).length > 0
          ? pendingAgentModels
          : undefined;
      const session = await gauntlet.createSession(
        pendingIdea,
        pendingAgents.map((a) => a.id),
        overrides,
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

  const handleMassSet = () => {
    if (!massProvider || !massModel) return;
    setAllPendingAgentModels(massProvider, massModel);
    blip();
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

      {!loading && providers.length > 0 && (
        <div
          style={{
            width: "min(680px, 100%)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            border: "2px solid var(--nes-gray)",
            background: "rgba(255,255,255,0.03)",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "0.55rem",
              color: "var(--nes-gray)",
              whiteSpace: "nowrap",
            }}
          >
            ALL BOSSES:
          </span>
          <select
            style={selectStyle}
            value={massProvider}
            onChange={(e) => {
              setMassProvider(e.target.value);
              setMassModel("");
            }}
          >
            <option value="">— provider —</option>
            {providers.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.provider}
              </option>
            ))}
          </select>
          <select
            style={{ ...selectStyle, flex: 1, minWidth: 100 }}
            value={massModel}
            onChange={(e) => setMassModel(e.target.value)}
            disabled={!massProvider}
          >
            <option value="">— model —</option>
            {(
              providers.find((p) => p.provider === massProvider)?.models ?? []
            ).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            className="pixel-btn"
            style={{
              fontSize: "0.55rem",
              padding: "4px 10px",
              whiteSpace: "nowrap",
            }}
            onClick={handleMassSet}
            disabled={!massProvider || !massModel}
          >
            ► SET ALL
          </button>
        </div>
      )}

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
                hint: "slight player advantage · default",
              },
              {
                id: "difficult" as Difficulty,
                label: "DIFFICULT",
                color: "var(--nes-red)",
                hint: "balanced · evenly matched",
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
            // ── Centre tile ─────────────────────────────────────────────
            if (item === "center") {
              return (
                <div
                  key="center"
                  style={{
                    border: "4px solid var(--nes-gray)",
                    background: "var(--nes-darkgray)",
                    aspectRatio: "1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: 10,
                    textAlign: "center",
                    position: "relative",
                    overflow: "hidden",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className="pixel-btn"
                    onClick={() => void handleReroll()}
                    disabled={rerollsLeft <= 0 || rerolling || starting}
                    title={`Reroll all challengers · ${MAX_REROLLS} per game`}
                    style={{
                      fontSize: "0.65rem",
                      padding: "8px 12px",
                      opacity: rerollsLeft <= 0 ? 0.4 : 1,
                      cursor: rerollsLeft <= 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {rerolling ? "🎲 …" : `🎲 ${rerollsLeft}x`}
                  </button>
                  <button
                    className="pixel-btn"
                    onClick={() => void handleStart()}
                    disabled={starting || rerolling}
                    style={{
                      fontSize: "0.7rem",
                      padding: "8px 14px",
                      background: "var(--nes-green)",
                      color: "var(--nes-black)",
                    }}
                  >
                    {starting ? "..." : "► BEGIN"}
                  </button>
                </div>
              );
            }

            // ── Boss tile (display-only) ─────────────────────────────────
            const agent = item as AgentSummary | undefined;
            if (!agent) return <div key={`empty-${pos}`} />;

            const bossIdx = gridPosToBossIndex(pos);
            const color = BOSS_COLORS[bossIdx % BOSS_COLORS.length];
            const modelOverride = pendingAgentModels[bossIdx];

            return (
              <div
                key={agent.id}
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
                <div style={{ fontSize: "0.7rem", lineHeight: 1.6 }}>
                  {agent.name}
                </div>
                {modelOverride && (
                  <div
                    style={{
                      fontSize: "0.5rem",
                      color: "var(--nes-yellow)",
                      lineHeight: 1.6,
                    }}
                  >
                    {modelOverride.provider}
                  </div>
                )}
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

      <div style={{ width: "min(680px, 100%)" }}>
        <button
          className="pixel-btn"
          style={{ fontSize: "0.875rem", padding: "12px 24px" }}
          onClick={() => {
            blip();
            navigate("/");
          }}
        >
          ◀ BACK
        </button>
      </div>
    </div>
  );
}
