import { useEffect, useReducer, useState } from "react";
import { useGameName } from "../store/configStore";

/**
 * Shown while the app is waiting on /api/config at startup. On a cold backend
 * (e.g. a free-tier host spinning up from sleep) this can take 1-2 minutes, so
 * instead of a blank page we run a little looping "duel" — the player and a
 * randomly-chosen boss lobbing gibberish at each other and chipping away HP,
 * with a confetti burst on a player win — plus a heads-up once the wait runs
 * long.
 */

const MAX_HP = 100;

// The game's roster, mirrored here so the loading screen can name a real boss
// before the backend (which owns the canonical list) is reachable.
const BOSSES = [
  { name: "The Archivist", emoji: "📜" },
  { name: "Bedrock", emoji: "🪨" },
  { name: "Cassandra", emoji: "🔮" },
  { name: "Cipher", emoji: "🌫️" },
  { name: "Echo", emoji: "💡" },
  { name: "The Gadfly", emoji: "🐝" },
  { name: "Hollow", emoji: "🥀" },
  { name: "Kaleido", emoji: "🔄" },
  { name: "The Magistrate", emoji: "🏛️" },
  { name: "Mammon", emoji: "💰" },
  { name: "Mephisto", emoji: "😈" },
  { name: "Nemesis", emoji: "⚔️" },
  { name: "Occam", emoji: "🪓" },
  { name: "The Quartermaster", emoji: "⚙️" },
  { name: "The Rival", emoji: "🛡️" },
  { name: "Syllogis", emoji: "⚖️" },
  { name: "The Warden", emoji: "🗝️" },
];

// Nonsensical "attacks" — pure punctuation, so it reads as heated arguing
// without saying anything. Indexed by turn so it's varied but deterministic.
const TAUNTS = [
  "?!?!",
  "‽‽‽",
  "#@%&!",
  "…!?",
  "¿¡?!",
  "!!1!",
  "§±∆!",
  "»»—!",
  "*&^%$",
  "‼⁇‼",
  "¬¬…!",
  "≠≠?!",
];
const DAMAGES = [14, 22, 9, 18, 27, 12, 20, 16, 24, 11];

const CONFETTI_COLORS = [
  "var(--nes-red)",
  "var(--nes-cyan)",
  "var(--nes-yellow)",
  "var(--nes-green)",
  "var(--nes-orange)",
  "var(--nes-purple)",
  "var(--nes-white)",
];

type Combatant = "player" | "bot";
type LogEntry = { id: number; side: Combatant; text: string; dmg: number };
type DuelState = {
  turn: number;
  playerHp: number;
  botHp: number;
  log: LogEntry[];
  lastHit: Combatant | null;
  winner: Combatant | null;
  bossIdx: number;
};

// One exchange per tick: the current attacker lands a hit. On a KO we hold the
// frame (winner set) so the win reads — and the confetti plays — then the next
// tick resets to a fresh duel against the next boss in the rotation.
function step(s: DuelState): DuelState {
  if (s.winner) {
    return {
      turn: 0,
      playerHp: MAX_HP,
      botHp: MAX_HP,
      log: [],
      lastHit: null,
      winner: null,
      bossIdx: (s.bossIdx + 1) % BOSSES.length,
    };
  }

  const attacker: Combatant = s.turn % 2 === 0 ? "player" : "bot";
  const dmg = DAMAGES[s.turn % DAMAGES.length];
  const text = TAUNTS[s.turn % TAUNTS.length];

  let { playerHp, botHp } = s;
  if (attacker === "player") botHp = Math.max(0, botHp - dmg);
  else playerHp = Math.max(0, playerHp - dmg);

  const log = [...s.log, { id: s.turn, side: attacker, text, dmg }].slice(-3);
  const koed = playerHp <= 0 || botHp <= 0;

  return {
    ...s,
    turn: s.turn + 1,
    playerHp,
    botHp,
    log,
    lastHit: attacker === "player" ? "bot" : "player",
    winner: koed ? attacker : null,
  };
}

function MiniHpBar({
  label,
  hp,
  align,
}: {
  label: string;
  hp: number;
  align: "left" | "right";
}) {
  const pct = Math.max(0, Math.min(100, (hp / MAX_HP) * 100));
  const cls = pct > 50 ? "high" : pct > 25 ? "medium" : "low";
  return (
    <div style={{ flex: 1, textAlign: align, minWidth: 0 }}>
      <div
        style={{
          fontSize: "0.55rem",
          color: "var(--nes-gray)",
          marginBottom: 4,
          letterSpacing: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div className="hp-bar-container">
        <div
          className={`hp-bar-fill hp-bar-fill--${cls}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Fighter({
  emoji,
  hit,
  hitId,
  dmg,
  flip,
}: {
  emoji: string;
  hit: boolean;
  hitId: number;
  dmg: number;
  flip?: boolean;
}) {
  return (
    <div style={{ position: "relative", width: 72, textAlign: "center" }}>
      {hit && (
        <span
          // key restarts the float animation on every fresh hit
          key={hitId}
          style={{
            position: "absolute",
            left: "50%",
            top: -6,
            transform: "translateX(-50%)",
            color: "var(--nes-red)",
            fontSize: "0.8rem",
            textShadow: "0 0 6px var(--nes-red)",
            animation: "dmg-float 900ms ease-out forwards",
            pointerEvents: "none",
          }}
        >
          -{dmg}
        </span>
      )}
      <div
        // remount on hit so the one-shot shake restarts each time
        key={hit ? `shake-${hitId}` : "idle"}
        className={`sprite ${hit ? "" : "sprite--idle"}`}
        style={{
          fontSize: 60,
          transform: flip ? "scaleX(-1)" : undefined,
          animation: hit ? "shake 160ms steps(1) 3" : undefined,
          filter: `drop-shadow(0 0 10px ${hit ? "var(--nes-red)" : "var(--nes-cyan)"})`,
        }}
      >
        {emoji}
      </div>
    </div>
  );
}

function Confetti({ burst }: { burst: number }) {
  // 28 pieces spread across the arena width, each with a staggered fall.
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    left: (i * 37) % 100,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: (i % 7) * 60,
    dur: 900 + (i % 5) * 120,
    size: 5 + (i % 3) * 2,
  }));
  return (
    <div
      key={burst}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            animation: `confetti-fall ${p.dur}ms linear ${p.delay}ms forwards`,
          }}
        />
      ))}
    </div>
  );
}

export default function LoadingScreen() {
  const gameName = useGameName();
  const [duel, tick] = useReducer(step, undefined, () => ({
    turn: 0,
    playerHp: MAX_HP,
    botHp: MAX_HP,
    log: [],
    lastHit: null,
    winner: null,
    bossIdx: Math.floor(Math.random() * BOSSES.length),
  }));
  const [dots, setDots] = useState(1);
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    const t = setInterval(tick, 1400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLongWait(true), 30000);
    return () => clearTimeout(t);
  }, []);

  const boss = BOSSES[duel.bossIdx];
  const prevDmg = DAMAGES[(duel.turn - 1 + DAMAGES.length) % DAMAGES.length];
  const playerWon = duel.winner === "player";

  return (
    <div
      className="screen"
      style={{
        gap: 22,
        maxWidth: 540,
        margin: "0 auto",
        width: "100%",
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "1.25rem",
          letterSpacing: 3,
          color: "var(--nes-cyan)",
        }}
      >
        {gameName.toUpperCase()}
      </h1>

      {/* Mini duel arena */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          width: "100%",
          border: "4px solid var(--nes-white)",
          background: "var(--nes-darkgray)",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {playerWon && <Confetti burst={duel.turn} />}

        <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
          <MiniHpBar label="YOU" hp={duel.playerHp} align="left" />
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--nes-yellow)",
              paddingBottom: 2,
            }}
          >
            VS
          </span>
          <MiniHpBar
            label={boss.name.toUpperCase()}
            hp={duel.botHp}
            align="right"
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 8px",
          }}
        >
          <Fighter
            emoji="🧑"
            hit={duel.lastHit === "player"}
            hitId={duel.turn}
            dmg={prevDmg}
          />
          <span
            style={{ fontSize: "0.9rem" }}
            className={playerWon ? "animate-glow" : ""}
          >
            {playerWon ? "🏆" : "⚔"}
          </span>
          <Fighter
            emoji={boss.emoji}
            hit={duel.lastHit === "bot"}
            hitId={duel.turn}
            dmg={prevDmg}
            flip
          />
        </div>

        {/* Back-and-forth gibberish transcript */}
        <div
          style={{
            minHeight: 96,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            justifyContent: "flex-end",
          }}
        >
          {playerWon ? (
            <div
              className="animate-glow"
              style={{
                fontSize: "0.8rem",
                color: "var(--nes-green)",
                letterSpacing: 2,
              }}
            >
              ★ YOU WIN! ★
            </div>
          ) : (
            duel.log.map((m) => {
              const mine = m.side === "player";
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    justifyContent: mine ? "flex-start" : "flex-end",
                    animation: `${mine ? "slide-in-left" : "slide-in-right"} 250ms ease`,
                  }}
                >
                  <div
                    className="dialog-box"
                    style={{
                      fontSize: "0.7rem",
                      padding: "4px 10px",
                      lineHeight: 1.4,
                      borderWidth: 3,
                      borderColor: mine ? "var(--nes-cyan)" : "var(--nes-red)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>{m.text}</span>
                    <span
                      style={{ fontSize: "0.55rem", color: "var(--nes-red)" }}
                    >
                      -{m.dmg}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <p style={{ fontSize: "0.8rem", color: "var(--nes-gray)" }}>
        WAKING THE SERVER{".".repeat(dots)}
      </p>

      {longWait && (
        <p
          style={{
            fontSize: "0.62rem",
            color: "var(--nes-yellow)",
            lineHeight: 1.9,
            maxWidth: 420,
          }}
        >
          Still waking — the server was asleep and cold starts can take a minute
          or two. Hang tight, the duel goes on.
        </p>
      )}
    </div>
  );
}
