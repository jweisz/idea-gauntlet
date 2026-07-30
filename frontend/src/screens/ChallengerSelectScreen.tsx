import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  gauntlet,
  ApiError,
  type AgentSummary,
  type Difficulty,
} from "../lib/api";
import { useGameStore } from "../store/gameStore";
import {
  useConfigStore,
  useBossCount,
  useMaxBossCount,
  useProgression,
} from "../store/configStore";
import { useChiptune } from "../hooks/useChiptune";
import CreditsBadge from "../components/CreditsBadge";

const MAX_REROLLS = 2;

const TILE_MAX = 218;
const TILE_GAP = 12;
// Free choice is 8 challengers, which fills 4x2 exactly — no odd cell to fill.
const FREE_CHOICE_COLUMNS = 4;

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

const DIFFICULTIES: {
  id: Difficulty;
  label: string;
  color: string;
  hint: string;
}[] = [
  { id: "easy", label: "EASY", color: "var(--nes-green)", hint: "hit harder" },
  {
    id: "normal",
    label: "NORMAL",
    color: "var(--nes-yellow)",
    hint: "balanced",
  },
  {
    id: "difficult",
    label: "DIFFICULT",
    color: "var(--nes-red)",
    hint: "no mercy",
  },
  {
    id: "insane",
    label: "INSANE",
    color: "var(--nes-purple)",
    // Kept to one line like the others. Now that the progression tagline is
    // gone, this is the only hint that you pick the order on this tier.
    hint: "any order",
  },
];

/** One challenger tile. `order` is shown only when the run is fought in order. */
function ChallengerTile({
  agent,
  colorIndex,
  order,
  dimmed,
}: {
  agent: AgentSummary;
  colorIndex: number;
  order?: number;
  dimmed: boolean;
}) {
  const color = BOSS_COLORS[colorIndex % BOSS_COLORS.length];
  return (
    <div
      style={{
        border: `4px solid ${color}`,
        boxShadow: `4px 4px 0 ${color}`,
        background: "var(--nes-darkgray)",
        // The grid track sets the width; stay square inside it.
        width: "100%",
        aspectRatio: "1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: 12,
        position: "relative",
        overflow: "hidden",
        opacity: dimmed ? 0.5 : 1,
        transition: "transform 80ms, box-shadow 80ms, opacity 120ms",
      }}
    >
      {order !== undefined && (
        <span
          style={{
            position: "absolute",
            top: 4,
            left: 6,
            fontSize: "0.5rem",
            color,
          }}
        >
          {order}
        </span>
      )}
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
  const [outOfCreditsMsg, setOutOfCreditsMsg] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  // When billing is disabled the deployment grants a fixed monthly allotment and
  // there's nothing to buy — so we show the server's "out of plays" message
  // instead of the purchase modal.
  const billingEnabled =
    useConfigStore((s) => s.config?.billing_enabled) ?? false;

  // The gauntlet's length and layout come from the server's config, never from
  // constants here. We fetch the longest possible lineup once and show a prefix
  // of it, so changing difficulty is instant and — because it's a prefix — the
  // challengers you'd already seen stay put as the gauntlet gets longer.
  const maxBosses = useMaxBossCount();
  const bossCount = useBossCount(difficulty);
  const isFreeChoice = useProgression(difficulty) === "free";
  const lineup = pendingAgents.slice(0, bossCount);

  const rerollsLeft = MAX_REROLLS - rerollsUsed;

  useEffect(() => {
    if (!pendingIdea) {
      navigate("/", { replace: true });
      return;
    }
    // loading's initial value already accounts for pendingAgents being
    // pre-populated (a reroll/back-navigation case), so only fetch when the
    // cached pool is too short for the longest gauntlet on offer.
    if (!maxBosses || pendingAgents.length >= maxBosses) return;
    gauntlet
      .randomAgents(maxBosses)
      .then(setPendingAgents)
      .catch(() => setError("Failed to load agents. Is the backend running?"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxBosses]);

  const handleStart = async () => {
    if (lineup.length !== bossCount || starting || loading || rerolling) return;
    setError(null);
    setStarting(true);
    attack();
    try {
      const session = await gauntlet.createSession(
        pendingIdea,
        lineup.map((a) => a.id),
        difficulty,
      );
      setSession(session);
      navigate("/stage-select");
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setOutOfCreditsMsg(e.detail);
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
      const fresh = await gauntlet.randomAgents(maxBosses);
      setPendingAgents(fresh);
      setRerollsUsed((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reroll challengers");
    } finally {
      setRerolling(false);
    }
  };

  const rerollDisabled = rerollsLeft <= 0 || rerolling || starting;

  return (
    // Three fixed bands: header, a flexible middle that absorbs every change in
    // lineup size, and the action row. `.screen` centres its column, which would
    // slide the title and buttons around as the roster grows from 3 to 8 — so
    // the height is pinned and the middle does all the giving instead.
    <div
      className="screen"
      style={{
        gap: 0,
        height: "100vh",
        justifyContent: "flex-start",
        width: "100%",
      }}
    >
      <div style={{ textAlign: "center", flex: "0 0 auto" }}>
        <h1
          className="text-cyan"
          style={{ fontSize: "1rem", marginBottom: 12 }}
        >
          {/* toolbar-clearance: the top-right controls collapse rather than
              overlap this title. Marked on the inline span so the measured
              edge is the text, not the full-width heading. */}
          <span className="toolbar-clearance">CHOOSE YOUR CHALLENGERS</span>
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
          flex: "0 0 auto",
          marginTop: 24,
        }}
      >
        <span
          style={{
            fontSize: "0.55rem",
            color: "var(--nes-gray)",
            alignSelf: "flex-start",
          }}
        >
          DIFFICULTY
        </span>
        {/* Wraps to 2x2 on narrow viewports rather than squeezing four abreast. */}
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 10, width: "100%" }}
        >
          {DIFFICULTIES.map(({ id, label, color, hint }) => {
            const active = difficulty === id;
            return (
              <button
                key={id}
                onClick={() => {
                  blip();
                  setDifficulty(id);
                }}
                style={{
                  flex: "1 1 140px",
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

      {/* Middle band: everything that changes size with the difficulty lives
          here, and it scrolls internally rather than pushing the header up or
          the buttons down. */}
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          overflowY: "auto",
          padding: "20px 0",
        }}
      >
        {loading ? (
          <p style={{ fontSize: "0.875rem", color: "var(--nes-gray)" }}>
            LOADING AGENTS...
          </p>
        ) : (
          // One layout for every tier, differing only in column count and
          // whether the tiles are numbered. Free choice takes 4 columns so its
          // 8 challengers fill two complete rows with no leftover cell; the
          // in-order tiers put their whole lineup on one row, since the numbers
          // read as a sequence. Tracks cap at the tile size and shrink below it
          // on narrow viewports.
          <div
            data-testid={isFreeChoice ? "challenger-grid" : "challenger-lineup"}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${
                isFreeChoice ? FREE_CHOICE_COLUMNS : bossCount
              }, minmax(0, ${TILE_MAX}px))`,
              justifyContent: "center",
              gap: TILE_GAP,
              width: "min(1500px, 100%)",
            }}
          >
            {lineup.map((agent, i) => (
              // Keyed by position, not agent id: a reroll swaps most/all agents
              // at once, and keying by id would remount every tile that changed,
              // killing the opacity transition mid-flight and popping the new
              // content in instantly (the "flash"). Keying by position keeps the
              // same DOM node across a reroll so its emoji/name just update in
              // place and the fade stays smooth.
              <ChallengerTile
                key={i}
                agent={agent}
                colorIndex={i}
                // Only meaningful when the run is fought in order.
                order={isFreeChoice ? undefined : i + 1}
                dimmed={rerolling}
              />
            ))}
          </div>
        )}

        {error && (
          <p style={{ color: "var(--nes-red)", fontSize: "0.875rem" }}>
            {error}
          </p>
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
              {outOfCreditsMsg ?? "You're out of credits."}
            </p>
            {billingEnabled && <CreditsBadge openOnMount />}
          </div>
        )}
      </div>

      {!loading && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            width: "min(1000px, 100%)",
            flex: "0 0 auto",
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
          {/* Same place on every tier — it used to jump to the grid's centre
              tile on free choice, which read as the button teleporting when you
              switched difficulty. */}
          <button
            className="pixel-btn"
            onClick={() => void handleReroll()}
            disabled={rerollDisabled}
            title={`Reroll all challengers · ${MAX_REROLLS} per game`}
            style={{
              fontSize: "0.8rem",
              padding: "12px 20px",
              whiteSpace: "nowrap",
              opacity: rerollsLeft <= 0 ? 0.4 : 1,
              cursor: rerollDisabled ? "not-allowed" : "pointer",
            }}
          >
            🎲 {rerolling ? "REROLLING..." : "REROLL"}
            <span
              style={{
                fontSize: "0.5rem",
                color: "var(--nes-yellow)",
                marginLeft: 8,
              }}
            >
              {rerollsLeft}x LEFT
            </span>
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
