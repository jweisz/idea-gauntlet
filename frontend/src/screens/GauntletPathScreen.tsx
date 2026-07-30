/**
 * The linear gauntlet: fight the critics in order, one after another.
 *
 * The whole lineup is shown up front — you can see the road ahead — but only
 * the next un-defeated boss is selectable. The free-choice layout lives in
 * StageSelectScreen; StageRouter picks between them.
 */
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/gameStore";
import { useChiptune } from "../hooks/useChiptune";
import { useLinearCursor } from "../hooks/useLinearCursor";
import { gauntletProgress } from "../lib/gauntletProgress";
import BypassCommandPanel from "../components/BypassCommandPanel";
import { useBypassCommand } from "../hooks/useBypassCommand";
import type { BattleBossOut, SessionOut } from "../lib/api";

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

// Matches the free-choice grid's tile size (3 columns of a 680px box), so a
// boss box looks the same whichever layout you're playing.
const NODE_MAX = 218;
const NODE_GAP = 6;
const CONNECTOR = 16;

/**
 * Width for one node so the whole path — N bosses, the synthesis node, and the
 * connectors between them — divides the row evenly and lands on a single line,
 * rather than leaving an orphan node wrapped onto a second row.
 */
function nodeSize(bossCount: number): string {
  const cells = bossCount + 1; // + synthesis
  const chrome = bossCount * CONNECTOR + (cells * 2 - 1) * NODE_GAP;
  return `clamp(64px, calc((100% - ${chrome}px) / ${cells}), ${NODE_MAX}px)`;
}

type NodeState = "defeated" | "next" | "locked";

function PathNode({
  boss,
  index,
  state,
  size,
  isCursor,
  onSelect,
}: {
  boss: BattleBossOut;
  index: number;
  state: NodeState;
  size: string;
  isCursor: boolean;
  onSelect: () => void;
}) {
  const color =
    state === "next"
      ? BOSS_COLORS[index % BOSS_COLORS.length]
      : "var(--nes-gray)";
  const selectable = state === "next";

  return (
    <div
      onClick={() => selectable && onSelect()}
      className={isCursor && selectable ? "tile--cursor" : ""}
      data-testid={`path-node-${state}`}
      title={boss.agent.name}
      style={{
        border: `4px solid ${color}`,
        boxShadow: selectable ? `4px 4px 0 ${color}` : "none",
        padding: 8,
        textAlign: "center",
        cursor: selectable ? "pointer" : "not-allowed",
        background: "var(--nes-darkgray)",
        position: "relative",
        transition: "transform 80ms, box-shadow 80ms",
        opacity: state === "locked" ? 0.45 : state === "defeated" ? 0.5 : 1,
        width: size,
        aspectRatio: "1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        overflow: "hidden",
        flex: "0 0 auto",
      }}
      onMouseEnter={(e) => {
        if (selectable)
          (e.currentTarget as HTMLDivElement).style.transform =
            "translate(-2px, -2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "";
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: 5,
          fontSize: "0.45rem",
          color,
        }}
      >
        {index + 1}
      </span>
      {state === "locked" && (
        <span
          style={{ position: "absolute", top: 3, right: 5, fontSize: "0.5rem" }}
        >
          🔒
        </span>
      )}
      {state === "defeated" && (
        <span
          style={{
            position: "absolute",
            top: 3,
            right: 5,
            fontSize: "0.5rem",
            color: "var(--nes-green)",
          }}
        >
          ✓
        </span>
      )}
      <div
        className={state === "next" ? "sprite sprite--idle" : "sprite"}
        style={{
          fontSize: 26,
          filter: state === "next" ? "none" : "grayscale(1)",
        }}
      >
        {boss.agent.emoji}
      </div>
      <div
        style={{
          fontSize: "0.5rem",
          lineHeight: 1.4,
          textAlign: "center",
          width: "100%",
          overflowWrap: "break-word",
          textDecoration: state === "defeated" ? "line-through" : "none",
        }}
      >
        {boss.agent.name}
      </div>
    </div>
  );
}

function PathConnector({ lit }: { lit: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        // Fixed, not shrinkable: nodeSize() budgets for these exactly.
        flex: `0 0 ${CONNECTOR}px`,
        height: 4,
        background: lit ? "var(--nes-yellow)" : "var(--nes-gray)",
        opacity: lit ? 1 : 0.3,
      }}
    />
  );
}

function SynthesisNode({
  unlocked,
  progress,
  size,
  isCursor,
  onSelect,
}: {
  unlocked: boolean;
  progress: string;
  size: string;
  isCursor: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={isCursor && unlocked ? "tile--cursor" : ""}
      data-testid="synthesis-node"
      style={{
        border: `4px solid ${unlocked ? "var(--nes-yellow)" : "var(--nes-gray)"}`,
        boxShadow: unlocked ? "4px 4px 0 var(--nes-yellow)" : "none",
        padding: 8,
        textAlign: "center",
        cursor: unlocked ? "pointer" : "not-allowed",
        background: unlocked ? "rgba(245,197,66,0.15)" : "var(--nes-darkgray)",
        width: size,
        aspectRatio: "1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        overflow: "hidden",
        flex: "0 0 auto",
      }}
    >
      <div style={{ fontSize: 26 }}>{unlocked ? "⭐" : "🔒"}</div>
      <div
        style={{
          fontSize: "0.5rem",
          lineHeight: 1.4,
          color: unlocked ? "var(--nes-yellow)" : "var(--nes-gray)",
        }}
      >
        {unlocked ? "SYNTHESIS" : progress}
      </div>
    </div>
  );
}

export default function GauntletPathScreen({
  session,
  bypassedRef,
}: {
  session: SessionOut;
  bypassedRef: React.MutableRefObject<boolean>;
}) {
  const navigate = useNavigate();
  const { setSession } = useGameStore();
  const { blip, unlock } = useChiptune();
  const bypass = useBypassCommand(session, setSession, bypassedRef);

  const bosses = session.bosses;
  const { total, defeatedCount, allDefeated, nextIndex } =
    gauntletProgress(bosses);
  // Positions 0..total-1 are bosses; `total` is the synthesis node.
  const synthesisPos = total;

  const handleSelect = (pos: number) => {
    if (pos === synthesisPos) {
      if (allDefeated) {
        unlock();
        navigate("/summary");
      } else blip();
      return;
    }
    if (pos !== nextIndex) {
      blip(); // defeated and locked nodes are inert
      return;
    }
    blip();
    navigate(`/boss/${bosses[pos].id}`);
  };

  const { cursor } = useLinearCursor({
    length: synthesisPos + 1,
    // Start on whatever the player would actually pick, so ENTER on arrival
    // fights the next boss (or opens the synthesis once the run is done).
    initial: allDefeated ? synthesisPos : Math.max(nextIndex, 0),
    onSelect: handleSelect,
    onMove: blip,
    enabled: !bypass.open && !bypass.running,
  });

  const nextBoss = nextIndex >= 0 ? bosses[nextIndex] : null;

  const size = nodeSize(total);

  return (
    // Three fixed bands (header / flexible middle / actions) so the title and
    // SAVE & EXIT hold their positions whether the run is 3 bosses or 8.
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
        <h1 className="text-cyan" style={{ fontSize: "1rem", marginBottom: 6 }}>
          <span className="toolbar-clearance">THE GAUNTLET</span>
        </h1>
        <p
          style={{
            fontSize: "0.65rem",
            color: "var(--nes-gray)",
            maxWidth: 500,
          }}
        >
          IDEA: <span className="text-yellow">"{session.idea}"</span>
        </p>
        <p
          style={{ fontSize: "0.6rem", color: "var(--nes-gray)", marginTop: 6 }}
        >
          ←→ NAVIGATE &nbsp;·&nbsp; ENTER: FIGHT
        </p>
      </div>

      {/* Middle band: absorbs the change in path length so the chrome above and
          below stays put. Wraps onto further rows rather than scrolling
          sideways, so the synthesis node stays visible on a narrow screen. */}
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          overflowY: "auto",
          padding: "20px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: NODE_GAP,
            width: "min(1500px, 100%)",
          }}
        >
          {bosses.map((boss, i) => {
            const state: NodeState =
              boss.status === "defeated"
                ? "defeated"
                : i === nextIndex
                  ? "next"
                  : "locked";
            return (
              <div
                key={boss.id}
                style={{ display: "contents" }}
                data-testid="path-segment"
              >
                {i > 0 && (
                  <PathConnector lit={bosses[i - 1].status === "defeated"} />
                )}
                <PathNode
                  boss={boss}
                  index={i}
                  state={state}
                  size={size}
                  isCursor={cursor === i}
                  onSelect={() => handleSelect(i)}
                />
              </div>
            );
          })}
          {total > 0 && <PathConnector lit={allDefeated} />}
          <SynthesisNode
            unlocked={allDefeated}
            progress={`${defeatedCount}/${total}`}
            size={size}
            isCursor={cursor === synthesisPos}
            onSelect={() => handleSelect(synthesisPos)}
          />
        </div>

        {nextBoss && (
          <p style={{ fontSize: "0.65rem", color: "var(--nes-yellow)" }}>
            <span className="pixel-arrow">▶</span> NEXT:{" "}
            {nextBoss.agent.name.toUpperCase()}
          </p>
        )}
      </div>

      <div
        style={{
          width: "min(1000px, 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flex: "0 0 auto",
        }}
      >
        <button
          className="pixel-btn"
          style={{ fontSize: "0.7rem", padding: "10px 16px" }}
          onClick={() => {
            blip();
            navigate("/");
          }}
        >
          💾 SAVE &amp; EXIT
        </button>
        <p style={{ fontSize: "0.65rem", color: "var(--nes-gray)" }}>
          {bypass.running
            ? "BYPASSING..."
            : `${defeatedCount}/${total} DEFEATED`}
        </p>
      </div>

      <BypassCommandPanel state={bypass} />
    </div>
  );
}
