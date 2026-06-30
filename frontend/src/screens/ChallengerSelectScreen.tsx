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
import { useGridCursor } from "../hooks/useGridCursor";
import CreditsBadge from "../components/CreditsBadge";

const CENTER_POS = 4;

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

type SwapState = { slotIndex: number; swapCursor: number } | null;

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
    swapPendingAgent,
    setSession,
    pendingAgentModels,
    setPendingAgentModel,
    clearPendingAgentModel,
    setAllPendingAgentModels,
  } = useGameStore();

  const [allAgents, setAllAgents] = useState<AgentSummary[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(pendingAgents.length === 0);
  const [swapState, setSwapState] = useState<SwapState>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("difficult");
  // Mass-set model state
  const [massProvider, setMassProvider] = useState("");
  const [massModel, setMassModel] = useState("");

  useEffect(() => {
    if (!pendingIdea) {
      navigate("/", { replace: true });
      return;
    }
    const fetchAll = gauntlet.allAgents();
    const fetchRandom =
      pendingAgents.length === 0
        ? gauntlet.randomAgents(8)
        : Promise.resolve(null);
    const fetchProviders = providersApi.list();
    Promise.all([fetchAll, fetchRandom, fetchProviders])
      .then(([all, random, provList]) => {
        setAllAgents(all);
        if (random) setPendingAgents(random);
        setProviders(provList);
      })
      .catch(() => setError("Failed to load agents. Is the backend running?"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const swapCandidates = allAgents.filter(
    (a) => !pendingAgents.find((p) => p.id === a.id),
  );

  const handleStart = async () => {
    if (pendingAgents.length !== 8 || starting || loading) return;
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

  const handleMassSet = () => {
    if (!massProvider || !massModel) return;
    setAllPendingAgentModels(massProvider, massModel);
    blip();
  };

  const handleGridSelect = (pos: number) => {
    if (pos === CENTER_POS) {
      void handleStart();
      return;
    }
    const slotIndex = gridPosToBossIndex(pos);
    if (swapCandidates.length === 0) return;
    blip();
    setSwapState({ slotIndex, swapCursor: 0 });
  };

  const handleBack = () => {
    if (swapState) {
      setSwapState(null);
    } else {
      blip();
      navigate("/");
    }
  };

  const { cursor } = useGridCursor({
    onSelect: handleGridSelect,
    onBack: handleBack,
    onMove: blip,
    enabled: swapState === null && !loading,
  });

  // Separate keyboard handler active only while swap panel is open
  useEffect(() => {
    if (!swapState) return;
    const n = swapCandidates.length;
    if (n === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        blip();
        setSwapState((s) =>
          s ? { ...s, swapCursor: (s.swapCursor - 1 + n) % n } : null,
        );
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        blip();
        setSwapState((s) =>
          s ? { ...s, swapCursor: (s.swapCursor + 1) % n } : null,
        );
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (swapState) {
          swapPendingAgent(
            swapState.slotIndex,
            swapCandidates[swapState.swapCursor],
          );
          blip();
          setSwapState(null);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSwapState(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [swapState, swapCandidates, swapPendingAgent, blip]);

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
          style={{ fontSize: "1rem", marginBottom: 10 }}
        >
          CHOOSE YOUR CHALLENGERS
        </h1>
        <p style={{ fontSize: "0.65rem", color: "var(--nes-gray)" }}>
          ↑↓←→ NAVIGATE &nbsp;·&nbsp; ENTER: SWAP &nbsp;·&nbsp; CENTER TILE:
          START GAME
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "min(680px, 100%)" }}>
        <span style={{ fontSize: "0.55rem", color: "var(--nes-gray)", alignSelf: "flex-start" }}>DIFFICULTY:</span>
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          {(
            [
              { id: "easy" as Difficulty,      label: "EASY",      color: "var(--nes-green)", hint: "hit harder · take less damage" },
              { id: "normal" as Difficulty,    label: "NORMAL",    color: "var(--nes-yellow)", hint: "slight player advantage" },
              { id: "difficult" as Difficulty, label: "DIFFICULT", color: "var(--nes-red)",   hint: "balanced · current default" },
            ] as const
          ).map(({ id, label, color, hint }) => {
            const active = difficulty === id;
            return (
              <button
                key={id}
                onClick={() => { blip(); setDifficulty(id); }}
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
                <span style={{ fontSize: "0.45rem", opacity: active ? 0.8 : 0.4 }}>{hint}</span>
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
            const isCursor = cursor === pos && swapState === null;

            // ── Centre tile ─────────────────────────────────────────────
            if (item === "center") {
              const active = isCursor && !starting;
              return (
                <div
                  key="center"
                  onClick={() => void handleStart()}
                  className={isCursor ? "tile--cursor" : ""}
                  style={{
                    border: `4px solid ${active ? "var(--nes-yellow)" : "var(--nes-gray)"}`,
                    boxShadow: active ? "4px 4px 0 var(--nes-yellow)" : "none",
                    background: active
                      ? "rgba(245,197,66,0.08)"
                      : "var(--nes-darkgray)",
                    aspectRatio: "1",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: 12,
                    textAlign: "center",
                    cursor: "pointer",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {isCursor && (
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        left: 6,
                        fontSize: "0.55rem",
                        color: "var(--nes-white)",
                        animation: "blink 600ms step-start infinite",
                      }}
                    >
                      ▶
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "0.55rem",
                      color: "var(--nes-gray)",
                      letterSpacing: 1,
                    }}
                  >
                    YOUR IDEA
                  </div>
                  <div
                    style={{
                      fontSize: "0.6rem",
                      color: "var(--nes-yellow)",
                      lineHeight: 1.8,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    "{pendingIdea}"
                  </div>
                  <div
                    style={{
                      fontSize: "0.55rem",
                      color: active
                        ? "var(--nes-green)"
                        : "var(--nes-darkgray)",
                      marginTop: 2,
                    }}
                  >
                    {starting ? "..." : "► START"}
                  </div>
                </div>
              );
            }

            // ── Boss tile ────────────────────────────────────────────────
            const agent = item as AgentSummary | undefined;
            if (!agent) return <div key={`empty-${pos}`} />;

            const bossIdx = gridPosToBossIndex(pos);
            const color = BOSS_COLORS[bossIdx % BOSS_COLORS.length];
            const isSwapping = swapState?.slotIndex === bossIdx;
            const modelOverride = pendingAgentModels[bossIdx];

            return (
              <div
                key={agent.id}
                onClick={() => {
                  blip();
                  setSwapState({ slotIndex: bossIdx, swapCursor: 0 });
                }}
                className={isCursor ? "tile--cursor" : ""}
                style={{
                  border: `4px solid ${isSwapping ? "var(--nes-yellow)" : color}`,
                  boxShadow: `4px 4px 0 ${isSwapping ? "var(--nes-yellow)" : color}`,
                  background: "var(--nes-darkgray)",
                  aspectRatio: "1",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: 12,
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  transition: "transform 80ms, box-shadow 80ms",
                }}
              >
                {isCursor && !isSwapping && (
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 6,
                      fontSize: "0.55rem",
                      color: "var(--nes-white)",
                      animation: "blink 600ms step-start infinite",
                    }}
                  >
                    ▶
                  </div>
                )}
                {isSwapping && (
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 6,
                      fontSize: "0.5rem",
                      color: "var(--nes-yellow)",
                    }}
                  >
                    SWAP
                  </div>
                )}
                <div className="sprite sprite--idle" style={{ fontSize: 36 }}>
                  {agent.emoji}
                </div>
                <div style={{ fontSize: "0.7rem", lineHeight: 1.6 }}>
                  {agent.name}
                </div>
                {modelOverride ? (
                  <div
                    style={{
                      fontSize: "0.5rem",
                      color: "var(--nes-yellow)",
                      lineHeight: 1.6,
                    }}
                  >
                    {modelOverride.provider}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "0.6rem",
                      color: isCursor ? "var(--nes-white)" : "var(--nes-cyan)",
                    }}
                  >
                    {isCursor ? "▶ SWAP" : "[SWAP]"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Swap panel */}
      {swapState !== null &&
        (() => {
          const slotOverride = pendingAgentModels[swapState.slotIndex];
          const slotAgent = pendingAgents[swapState.slotIndex];
          const swapProviderModels =
            providers.find((p) => p.provider === (slotOverride?.provider ?? ""))
              ?.models ?? [];
          return (
            <div
              style={{
                width: "min(680px, 100%)",
                background: "var(--nes-darkgray)",
                border: "4px solid var(--nes-yellow)",
                boxShadow: "4px 4px 0 var(--nes-yellow)",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ fontSize: "0.6rem", color: "var(--nes-yellow)" }}>
                REPLACE: {slotAgent?.name}
                &nbsp;|&nbsp; ←→ MOVE &nbsp;·&nbsp; ENTER: CONFIRM &nbsp;·&nbsp;
                ESC: CANCEL
              </div>

              {/* Candidates */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 4,
                }}
              >
                {swapCandidates.length === 0 ? (
                  <p style={{ fontSize: "0.65rem", color: "var(--nes-gray)" }}>
                    NO OTHER AGENTS AVAILABLE
                  </p>
                ) : (
                  swapCandidates.map((candidate, i) => {
                    const isSelected = i === swapState.swapCursor;
                    return (
                      <div
                        key={candidate.id}
                        onClick={() => {
                          swapPendingAgent(swapState.slotIndex, candidate);
                          blip();
                          setSwapState(null);
                        }}
                        style={{
                          border: `3px solid ${isSelected ? "var(--nes-white)" : "var(--nes-gray)"}`,
                          boxShadow: isSelected
                            ? "0 0 8px var(--nes-white)"
                            : "none",
                          background: isSelected
                            ? "rgba(255,255,255,0.1)"
                            : "var(--nes-black)",
                          padding: "10px 12px",
                          minWidth: 88,
                          textAlign: "center",
                          cursor: "pointer",
                          flexShrink: 0,
                          position: "relative",
                        }}
                      >
                        {isSelected && (
                          <div
                            style={{
                              position: "absolute",
                              top: 2,
                              left: 4,
                              fontSize: "0.5rem",
                              color: "var(--nes-white)",
                              animation: "blink 600ms step-start infinite",
                            }}
                          >
                            ▶
                          </div>
                        )}
                        <div style={{ fontSize: 24 }}>{candidate.emoji}</div>
                        <div
                          style={{
                            fontSize: "0.6rem",
                            marginTop: 6,
                            lineHeight: 1.6,
                          }}
                        >
                          {candidate.name}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Per-slot model override */}
              {providers.length > 0 && (
                <div
                  style={{
                    borderTop: "2px solid rgba(255,255,255,0.1)",
                    paddingTop: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{ fontSize: "0.55rem", color: "var(--nes-gray)" }}
                  >
                    BOSS MODEL &nbsp;·&nbsp;
                    <span style={{ color: "var(--nes-gray)" }}>
                      agent default: {slotAgent?.provider}/{slotAgent?.model}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <select
                      style={selectStyle}
                      value={slotOverride?.provider ?? ""}
                      onChange={(e) => {
                        const prov = e.target.value;
                        if (!prov) {
                          clearPendingAgentModel(swapState.slotIndex);
                          return;
                        }
                        const firstModel =
                          providers.find((p) => p.provider === prov)
                            ?.models[0] ?? "";
                        setPendingAgentModel(
                          swapState.slotIndex,
                          prov,
                          firstModel,
                        );
                      }}
                    >
                      <option value="">— agent default —</option>
                      {providers.map((p) => (
                        <option key={p.provider} value={p.provider}>
                          {p.provider}
                        </option>
                      ))}
                    </select>
                    <select
                      style={{ ...selectStyle, flex: 1, minWidth: 100 }}
                      value={slotOverride?.model ?? ""}
                      disabled={!slotOverride?.provider}
                      onChange={(e) => {
                        if (slotOverride?.provider)
                          setPendingAgentModel(
                            swapState.slotIndex,
                            slotOverride.provider,
                            e.target.value,
                          );
                      }}
                    >
                      <option value="">— model —</option>
                      {swapProviderModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    {slotOverride && (
                      <button
                        className="pixel-btn"
                        style={{ fontSize: "0.5rem", padding: "3px 8px" }}
                        onClick={() =>
                          clearPendingAgentModel(swapState.slotIndex)
                        }
                      >
                        RESET
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {error && (
        <p style={{ color: "var(--nes-red)", fontSize: "0.875rem" }}>{error}</p>
      )}

      {outOfCredits && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
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
