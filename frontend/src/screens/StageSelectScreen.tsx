/**
 * Free-choice stage select: the 3x3 grid, Mega Man style — pick any boss, in
 * any order. Used by the insane tier and by every game created before gauntlet
 * length was variable. The in-order layout lives in GauntletPathScreen;
 * StageRouter picks between them.
 */
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/gameStore";
import { useChiptune } from "../hooks/useChiptune";
import { useGridCursor } from "../hooks/useGridCursor";
import { gauntletProgress } from "../lib/gauntletProgress";
import BypassCommandPanel from "../components/BypassCommandPanel";
import { useBypassCommand } from "../hooks/useBypassCommand";
import type { BattleBossOut, SessionOut } from "../lib/api";

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

function BossCell({
  boss,
  colorIndex,
  isCursor,
  onSelect,
}: {
  boss: BattleBossOut;
  colorIndex: number;
  isCursor: boolean;
  onSelect: () => void;
}) {
  const defeated = boss.status === "defeated";
  const color = BOSS_COLORS[colorIndex % BOSS_COLORS.length];

  return (
    <div
      onClick={() => {
        if (!defeated) onSelect();
      }}
      className={isCursor ? "tile--cursor" : ""}
      style={{
        border: `4px solid ${color}`,
        boxShadow: defeated ? "none" : `4px 4px 0 ${color}`,
        padding: 12,
        textAlign: "center",
        cursor: defeated ? "default" : "pointer",
        background: "var(--nes-darkgray)",
        position: "relative",
        transition: "transform 80ms, box-shadow 80ms",
        opacity: defeated ? 0.5 : 1,
        aspectRatio: "1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (!defeated)
          (e.currentTarget as HTMLDivElement).style.transform =
            "translate(-2px, -2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "";
      }}
    >
      {defeated && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            zIndex: 2,
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "var(--nes-gray)" }}>
            DEFEATED
          </span>
          <span
            style={{
              fontSize: "0.55rem",
              color: "var(--nes-gray)",
              opacity: 0.6,
              textAlign: "center",
              padding: "0 6px",
              lineHeight: 1.5,
              width: "100%",
              overflowWrap: "break-word",
            }}
          >
            {boss.agent.name}
          </span>
        </div>
      )}
      {!defeated && (
        <>
          <div className="sprite sprite--idle" style={{ fontSize: 36 }}>
            {boss.agent.emoji}
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
            {boss.agent.name}
          </div>
        </>
      )}
    </div>
  );
}

function CenterCell({
  allDefeated,
  total,
  isCursor,
  onSelect,
}: {
  allDefeated: boolean;
  total: number;
  isCursor: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={isCursor && allDefeated ? "tile--cursor" : ""}
      style={{
        border: `4px solid ${allDefeated ? "var(--nes-yellow)" : "var(--nes-gray)"}`,
        boxShadow: allDefeated ? "4px 4px 0 var(--nes-yellow)" : "none",
        padding: 12,
        textAlign: "center",
        cursor: allDefeated ? "pointer" : "not-allowed",
        background: allDefeated
          ? "rgba(245,197,66,0.15)"
          : "var(--nes-darkgray)",
        aspectRatio: "1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 36 }}>{allDefeated ? "⭐" : "🔒"}</div>
      <div
        style={{
          fontSize: "0.8rem",
          lineHeight: 1.6,
          color: allDefeated ? "var(--nes-yellow)" : "var(--nes-gray)",
        }}
      >
        {allDefeated ? "SYNTHESIS" : "LOCKED"}
      </div>
      {!allDefeated && (
        <div
          style={{ fontSize: "0.7rem", color: "var(--nes-gray)", marginTop: 4 }}
        >
          DEFEAT ALL {total}
        </div>
      )}
    </div>
  );
}

export default function StageSelectScreen({
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
  const { total, defeatedCount, allDefeated } = gauntletProgress(bosses);

  const handleGridSelect = (pos: number) => {
    if (pos === CENTER_POS) {
      if (allDefeated) {
        unlock();
        navigate("/summary");
      } else blip();
      return;
    }
    const bossIdx = pos < CENTER_POS ? pos : pos - 1;
    const boss = bosses[bossIdx];
    if (!boss || boss.status === "defeated") {
      blip();
      return;
    }
    blip();
    navigate(`/boss/${boss.id}`);
  };

  const { cursor } = useGridCursor({
    onSelect: handleGridSelect,
    onMove: blip,
    enabled: !bypass.open && !bypass.running,
    skipPositions: allDefeated ? [] : [CENTER_POS],
  });

  // Arrange into 3×3: positions 0-3 → bosses 0-3, pos 4 = center, pos 5-8 → bosses 4-7
  const grid: (BattleBossOut | "center" | null)[] = [
    bosses[0],
    bosses[1],
    bosses[2],
    bosses[3],
    "center",
    bosses[4],
    bosses[5],
    bosses[6],
    bosses[7],
  ];

  let bossColorIndex = 0;

  return (
    <div className="screen" style={{ gap: 24 }}>
      <div style={{ textAlign: "center" }}>
        <h1 className="text-cyan" style={{ fontSize: "1rem", marginBottom: 6 }}>
          <span className="toolbar-clearance">STAGE SELECT</span>
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
          ↑↓←→ NAVIGATE &nbsp;·&nbsp; ENTER: SELECT
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          width: "min(680px, 100%)",
        }}
      >
        {grid.map((cell, i) => {
          if (cell === "center") {
            return (
              <CenterCell
                key="center"
                allDefeated={allDefeated}
                total={total}
                isCursor={cursor === i}
                onSelect={() => {
                  if (allDefeated) {
                    unlock();
                    navigate("/summary");
                  } else blip();
                }}
              />
            );
          }
          if (cell === null) return <div key={`empty-${i}`} />;
          const boss = cell;
          const colorIdx = bossColorIndex++;
          return (
            <BossCell
              key={boss.id}
              boss={boss}
              colorIndex={colorIdx}
              isCursor={cursor === i}
              onSelect={() => navigate(`/boss/${boss.id}`)}
            />
          );
        })}
      </div>

      <div
        style={{
          width: "min(680px, 100%)",
          display: "flex",
          justifyContent: "flex-start",
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
      </div>

      <p style={{ fontSize: "0.65rem", color: "var(--nes-gray)" }}>
        {bypass.running ? "BYPASSING..." : `${defeatedCount}/${total} DEFEATED`}
      </p>

      <BypassCommandPanel state={bypass} />
    </div>
  );
}
