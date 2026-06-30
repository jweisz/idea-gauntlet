import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/gameStore";
import { useChiptune } from "../hooks/useChiptune";
import { useGridCursor } from "../hooks/useGridCursor";
import { gauntlet } from "../lib/api";
import type { BattleBossOut } from "../lib/api";

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
          <div style={{ fontSize: "0.8rem", lineHeight: 1.6 }}>
            {boss.agent.name}
          </div>
        </>
      )}
    </div>
  );
}

function CenterCell({
  allDefeated,
  isCursor,
  onSelect,
}: {
  allDefeated: boolean;
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
          DEFEAT ALL 8
        </div>
      )}
    </div>
  );
}

export default function StageSelectScreen() {
  const navigate = useNavigate();
  const { session, setSession } = useGameStore();
  const { blip, unlock } = useChiptune();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdValue, setCmdValue] = useState("/");
  const [cmdRunning, setCmdRunning] = useState(false);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  // Prevents a slow mount-fetch from overwriting a bypass result that arrived later.
  const bypassedRef = useRef(false);

  const bosses = session?.bosses ?? [];
  const allDefeated =
    bosses.length > 0 && bosses.every((b) => b.status === "defeated");

  // Open command panel on "/" keypress (when panel is not already open)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (cmdOpen || cmdRunning) return;
      if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setCmdValue("/");
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cmdOpen, cmdRunning]);

  // Focus the input whenever the panel opens
  useEffect(() => {
    if (cmdOpen) cmdInputRef.current?.focus();
  }, [cmdOpen]);

  const closeCmd = () => {
    setCmdOpen(false);
    setCmdValue("/");
  };

  const handleCommand = async () => {
    const cmd = cmdValue.trim();
    closeCmd();
    if (cmd !== "/bypass" || !session) return;

    setCmdRunning(true);
    bypassedRef.current = true;
    try {
      const toBypass = bosses.filter((b) => b.status !== "defeated");
      for (const boss of toBypass) {
        await gauntlet.bypassBattle(session.id, boss.id);
      }
      // Patch locally first so allDefeated flips immediately without a round-trip.
      setSession({
        ...session,
        bosses: session.bosses.map((b) => ({ ...b, status: "defeated" as const, agent_hp: 0 })),
      });
      // Confirm with server in background.
      gauntlet.getSession(session.id).then(setSession).catch(() => {});
    } finally {
      setCmdRunning(false);
    }
  };

  const handleGridSelect = (pos: number) => {
    if (!session) return;
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

  // Hook must be called before any early returns (Rules of Hooks)
  const { cursor } = useGridCursor({
    onSelect: handleGridSelect,
    onMove: blip,
    enabled: !!session && !cmdOpen && !cmdRunning,
    skipPositions: allDefeated ? [] : [CENTER_POS],
  });

  useEffect(() => {
    if (!session) {
      navigate("/", { replace: true });
      return;
    }
    // Re-fetch on mount so boss statuses are fresh (avoids stale store after battles).
    // Guard: don't overwrite a bypass result that arrived after this request started.
    gauntlet.getSession(session.id).then((s) => {
      if (!bypassedRef.current) setSession(s);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return null;

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
          STAGE SELECT
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

      <p style={{ fontSize: "0.65rem", color: "var(--nes-gray)" }}>
        {cmdRunning
          ? "BYPASSING..."
          : `${bosses.filter((b) => b.status === "defeated").length}/8 DEFEATED`}
      </p>

      {/* Command panel — fixed bottom-right, opens on "/" */}
      {cmdOpen && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 1000,
            background: "var(--nes-darkgray)",
            border: "3px solid var(--nes-cyan)",
            boxShadow: "4px 4px 0 var(--nes-cyan)",
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minWidth: 220,
          }}
        >
          <div style={{ fontSize: "0.55rem", color: "var(--nes-cyan)" }}>
            COMMAND
          </div>
          <input
            ref={cmdInputRef}
            className="pixel-input"
            value={cmdValue}
            onChange={(e) => setCmdValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.nativeEvent.stopImmediatePropagation();
                void handleCommand();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.nativeEvent.stopImmediatePropagation();
                closeCmd();
              }
            }}
            style={{ fontSize: "0.7rem", padding: "6px 8px", width: "100%" }}
            spellCheck={false}
            autoComplete="off"
          />
          <div style={{ fontSize: "0.5rem", color: "var(--nes-gray)" }}>
            ENTER to run · ESC to cancel
          </div>
        </div>
      )}
    </div>
  );
}
