import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { gauntlet } from "../lib/api";
import { useGameStore } from "../store/gameStore";
import { useChiptune } from "../hooks/useChiptune";

const MAX_HP = 100;

function HpBar({
  hp,
  max = MAX_HP,
  label,
}: {
  hp: number;
  max?: number;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const cls = pct > 50 ? "high" : pct > 25 ? "medium" : "low";
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: "0.65rem", color: "var(--nes-gray)" }}>
          {label}
        </span>
        <span style={{ fontSize: "0.65rem", color: "var(--nes-cyan)" }}>
          {hp}/{max}
        </span>
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

function TypewriterText({
  text,
  onDone,
}: {
  text: string;
  onDone?: () => void;
}) {
  const { typingBlip } = useChiptune();
  const [displayed, setDisplayed] = useState("");
  const idxRef = useRef(0);

  useEffect(() => {
    idxRef.current = 0;

    const interval = setInterval(() => {
      if (idxRef.current >= text.length) {
        clearInterval(interval);
        onDone?.();
        return;
      }
      setDisplayed(text.slice(0, idxRef.current + 1));
      idxRef.current++;
      if (idxRef.current % 3 === 0) typingBlip();
    }, 22);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return <>{displayed}</>;
}

type Message = {
  role: "user" | "agent" | "system";
  content: string;
  damage?: number | null;
  damage_reason?: string | null;
};

type ScreenEffect = {
  target: "player" | "boss";
  tier: 1 | 2 | 3;
  id: number;
} | null;

const EFFECT_DURATION = { 1: 400, 2: 600, 3: 800 } as const;

function getEffectTier(damage: number): 1 | 2 | 3 {
  if (damage >= 30) return 3;
  if (damage >= 20) return 2;
  return 1;
}

export default function BattleScreen() {
  const navigate = useNavigate();
  const { bossId } = useParams<{ bossId: string }>();
  const { session, setSession, setLiveHp } = useGameStore();
  const { attack, hurt, victory, defeat } = useChiptune();

  const boss = session?.bosses.find((b) => b.id === Number(bossId));

  const [messages, setMessages] = useState<Message[]>([]);
  const [userHp, setUserHp] = useState(boss?.user_hp ?? MAX_HP);
  const [agentHp, setAgentHp] = useState(boss?.agent_hp ?? MAX_HP);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [openingLoading, setOpeningLoading] = useState(false);
  const [latestAgentText, setLatestAgentText] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"user" | "agent" | null>(null);
  const [defeatReason, setDefeatReason] = useState<string | null>(null);
  const [damageFlash, setDamageFlash] = useState<"user" | "agent" | null>(null);
  const [screenEffect, setScreenEffect] = useState<ScreenEffect>(null);
  const [giveUpOpen, setGiveUpOpen] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const initRanRef = useRef(false);
  const userScrolledUpRef = useRef(false);
  const pendingAgentDamageRef = useRef<number | null>(null);
  const pendingAgentDamageReasonRef = useRef<string | null>(null);
  // Deferred until the boss's typewriter finishes
  const pendingPlayerHpRef = useRef<number | null>(null);
  const pendingPlayerDamageRef = useRef<number>(0);
  const pendingOutcomeRef = useRef<{
    winner: "user" | "agent";
    defeatReason?: string;
  } | null>(null);

  // Trigger full-screen damage effect. Shake is applied via direct DOM class
  // manipulation (with reflow trick) so animations restart correctly on
  // consecutive hits without remounting the component tree.
  const triggerDamageEffect = useCallback(
    (target: "player" | "boss", damage: number) => {
      const tier = getEffectTier(damage);
      setScreenEffect({ target, tier, id: Date.now() });
      setTimeout(() => setScreenEffect(null), EFFECT_DURATION[tier]);

      if (tier >= 2) {
        const el = shakeRef.current;
        if (!el) return;
        const shakeCls =
          tier === 3 ? "screen-shake--hard" : "screen-shake--mild";
        el.classList.remove(
          "screen-shake--mild",
          "screen-shake--hard",
          "screen-blur--hit",
        );
        void el.offsetHeight; // force reflow to restart animation
        el.classList.add(shakeCls);
        if (tier === 3) el.classList.add("screen-blur--hit");
        setTimeout(() => {
          el.classList.remove(
            "screen-shake--mild",
            "screen-shake--hard",
            "screen-blur--hit",
          );
        }, EFFECT_DURATION[tier]);
      }
    },
    [],
  );

  // On mount: auto-reset a previously failed battle (clears transcript + HP),
  // then populate history and trigger the boss opening if fresh.
  useEffect(() => {
    if (!boss || !session) {
      navigate("/", { replace: true });
      return;
    }

    const init = async () => {
      if (initRanRef.current) return;
      initRanRef.current = true;

      let activeBoss = boss;

      if (boss.status === "failed") {
        await gauntlet.retryBattle(session.id, boss.id);
        const updated = await gauntlet.getSession(session.id);
        setSession(updated);
        activeBoss = updated.bosses.find((b) => b.id === boss.id) ?? boss;
      }

      setUserHp(activeBoss.user_hp);
      setAgentHp(activeBoss.agent_hp);
      setMessages(
        activeBoss.messages.map((m) => ({
          role: m.role as "user" | "agent",
          content: m.content,
          damage: m.damage,
          damage_reason: m.damage_reason,
        })),
      );

      if (activeBoss.messages.length === 0) {
        setOpeningLoading(true);
        gauntlet
          .getBattleOpening(session.id, activeBoss.id)
          .then((result) => {
            pendingAgentDamageRef.current = null;
            pendingAgentDamageReasonRef.current = null;
            setLatestAgentText(result.agent_reply);
          })
          .catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : "Connection error";
            setMessages([
              { role: "agent", content: `[Opening failed: ${msg}]` },
            ]);
          })
          .finally(() => setOpeningLoading(false));
      }
    };

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll: always pin to bottom unless the user has manually scrolled up.
  // We track user intent via a scroll listener rather than a fixed px threshold —
  // the old 120px threshold broke when React 18 batched multiple typewriter ticks
  // into one mutation, causing multi-line jumps that exceeded the threshold.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;

    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUpRef.current = distFromBottom > 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const observer = new MutationObserver(() => {
      if (!userScrolledUpRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  if (!boss || !session) return null;

  const handleSend = async () => {
    if (!input.trim() || sending || outcome) return;

    const content = input.trim();
    setInput("");
    setSending(true);
    userScrolledUpRef.current = false; // snap back so user sees their message + reply

    if (content === "/bypass") {
      try {
        const result = await gauntlet.bypassBattle(session.id, boss.id);
        setAgentHp(0);
        triggerDamageEffect("boss", result.user_damage);
        pendingPlayerHpRef.current = result.user_hp;
        pendingPlayerDamageRef.current = 0;
        pendingAgentDamageRef.current = null;
        pendingAgentDamageReasonRef.current = null;
        pendingOutcomeRef.current = { winner: "user" };
        setLiveHp(boss.id, result.user_hp, 0);
        setLatestAgentText(result.agent_reply);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content: `[BYPASS ERROR: ${e instanceof Error ? e.message : "unknown"}]`,
          },
        ]);
      } finally {
        setSending(false);
      }
      return;
    }

    attack();

    setMessages((prev) => [...prev, { role: "user", content }]);

    try {
      const result = await gauntlet.sendMessage(session.id, boss.id, content);

      // Annotate the user message we just added with its damage score and reason
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 && m.role === "user"
            ? {
                ...m,
                damage: result.user_damage,
                damage_reason: result.user_damage_reason,
              }
            : m,
        ),
      );

      // Boss damage is immediate — the user's attack already landed
      setAgentHp(result.agent_hp);
      if (result.user_damage > 0) {
        setDamageFlash("agent");
        setTimeout(() => setDamageFlash(null), 600);
        triggerDamageEffect("boss", result.user_damage);
      }

      // Player HP and damage effect are deferred until the boss finishes speaking
      pendingPlayerHpRef.current = result.user_hp;
      pendingPlayerDamageRef.current = result.agent_damage;

      // Keep liveHp in sync for stage-select mini-bars (doesn't affect local HP display)
      setLiveHp(boss.id, result.user_hp, result.agent_hp);

      pendingAgentDamageRef.current = result.agent_damage;
      pendingAgentDamageReasonRef.current = result.agent_damage_reason ?? null;

      // Outcome is also deferred so the boss's final words play out first
      if (result.battle_over && result.winner) {
        pendingOutcomeRef.current = {
          winner: result.winner as "user" | "agent",
          defeatReason: result.defeat_reason ?? undefined,
        };
        if (result.winner === "user") {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `★ ${boss.agent.name} has been defeated!` },
          ]);
        }
      }

      setLatestAgentText(result.agent_reply);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: `[ERROR: ${e instanceof Error ? e.message : "unknown"}]`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleAgentTypingDone = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        role: "agent",
        content: text,
        damage: pendingAgentDamageRef.current,
        damage_reason: pendingAgentDamageReasonRef.current,
      },
    ]);
    pendingAgentDamageRef.current = null;
    pendingAgentDamageReasonRef.current = null;
    setLatestAgentText(null);

    // Apply deferred player HP damage now that the boss has finished speaking
    const newUserHp = pendingPlayerHpRef.current;
    const playerDmg = pendingPlayerDamageRef.current;
    pendingPlayerHpRef.current = null;
    pendingPlayerDamageRef.current = 0;

    if (newUserHp !== null) {
      setUserHp(newUserHp);
      if (playerDmg > 0) {
        setDamageFlash("user");
        hurt();
        setTimeout(() => setDamageFlash(null), 600);
        triggerDamageEffect("player", playerDmg);
      }
    }

    // Resolve any pending battle outcome
    const pendingOutcome = pendingOutcomeRef.current;
    pendingOutcomeRef.current = null;
    if (pendingOutcome) {
      setOutcome(pendingOutcome.winner);
      if (pendingOutcome.winner === "user") {
        victory();
      } else {
        defeat();
      }
      if (pendingOutcome.defeatReason)
        setDefeatReason(pendingOutcome.defeatReason);
      gauntlet
        .getSession(session.id)
        .then((updated) => setSession(updated))
        .catch(() => {
          /* ignore */
        });
    }
  };

  return (
    <div
      ref={shakeRef}
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "12px 16px",
        gap: 10,
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      {/* Full-screen damage overlay — key forces remount so animation restarts on every hit */}
      {screenEffect && (
        <div
          key={screenEffect.id}
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 500,
            background:
              screenEffect.target === "player"
                ? "rgb(220, 30, 30)"
                : "rgb(255, 240, 80)",
            animation: `overlay-t${screenEffect.tier} ${EFFECT_DURATION[screenEffect.tier]}ms ease-out forwards`,
          }}
        />
      )}

      {/* HP bars */}
      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "flex-end",
          padding: "10px 14px",
          border: "4px solid var(--nes-white)",
          background: "var(--nes-darkgray)",
          flexShrink: 0,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}
        >
          <div
            className={`sprite ${damageFlash === "user" ? "sprite--shake" : "sprite--idle"}`}
            style={{ fontSize: 36 }}
          >
            🧑
          </div>
          <HpBar hp={userHp} label="YOU" />
        </div>
        <div
          style={{
            fontSize: "0.8rem",
            color: "var(--nes-yellow)",
            flexShrink: 0,
          }}
        >
          VS
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flex: 1,
            flexDirection: "row-reverse",
          }}
        >
          <div
            className={`sprite ${damageFlash === "agent" ? "sprite--shake" : "sprite--idle"}`}
            style={{ fontSize: 36 }}
          >
            {boss.agent.emoji}
          </div>
          <HpBar hp={agentHp} label={boss.agent.name.toUpperCase()} />
        </div>
      </div>

      {/* Idea reminder */}
      <div
        style={{
          fontSize: "0.6rem",
          color: "var(--nes-gray)",
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        DEFENDING: <span className="text-yellow">"{session.idea}"</span>
      </div>

      {/* Transcript — fills remaining space, scrolls internally */}
      <div
        ref={transcriptRef}
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "4px 2px",
        }}
      >
        {messages.length === 0 && !latestAgentText && (
          <div
            className={`dialog-box${openingLoading ? " dialog-box--active" : ""}`}
            style={{ color: "var(--nes-gray)", fontSize: "0.7rem" }}
          >
            {openingLoading
              ? `${boss.agent.name} is preparing their challenge...`
              : `${boss.agent.name} awaits...`}
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "system") {
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  margin: "4px 0",
                  opacity: 0.9,
                  animation: "fade-in 400ms ease",
                }}
              >
                <div style={{ flex: 1, height: 1, background: "var(--nes-yellow)", opacity: 0.35 }} />
                <span style={{ color: "var(--nes-yellow)", whiteSpace: "nowrap", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "1rem" }}>⭐</span>
                  <span style={{ fontSize: "0.6rem" }}>{msg.content.replace(/^★ /, "")}</span>
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--nes-yellow)", opacity: 0.35 }} />
              </div>
            );
          }

          return (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <div style={{ fontSize: 18, flexShrink: 0, marginTop: 4 }}>
              {msg.role === "user" ? "🧑" : boss.agent.emoji}
            </div>
            <div
              style={{
                maxWidth: "75%",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                className="dialog-box"
                style={{
                  fontSize: "0.75rem",
                  lineHeight: 1.9,
                  borderColor:
                    msg.role === "user" ? "var(--nes-cyan)" : "var(--nes-red)",
                  boxShadow:
                    msg.role === "user"
                      ? "3px 3px 0 var(--nes-cyan)"
                      : "3px 3px 0 var(--nes-red)",
                }}
              >
                {msg.content}
              </div>
              {/* Damage chip — only shown when damage is known and non-zero */}
              {msg.damage != null && msg.damage > 0 && (
                <div
                  style={{
                    fontSize: "0.6rem",
                    color:
                      msg.role === "user"
                        ? "var(--nes-green)"
                        : "var(--nes-red)",
                    padding: "4px 8px",
                    border: `2px solid ${msg.role === "user" ? "var(--nes-green)" : "var(--nes-red)"}`,
                    background:
                      msg.role === "user"
                        ? "rgba(34,177,76,0.12)"
                        : "rgba(214,40,40,0.12)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <span>
                    {msg.role === "user"
                      ? `⚔ -${msg.damage} HP to ${boss.agent.name}`
                      : `💥 -${msg.damage} HP to you`}
                  </span>
                  {msg.damage_reason &&
                    (() => {
                      const [synthesis, subscores] =
                        msg.damage_reason.split("\n");
                      return (
                        <>
                          <span
                            style={{
                              color:
                                msg.role === "user"
                                  ? "rgba(34,177,76,0.75)"
                                  : "rgba(214,40,40,0.75)",
                              fontSize: "0.55rem",
                            }}
                          >
                            {synthesis}
                          </span>
                          {subscores && (
                            <span
                              style={{
                                color:
                                  msg.role === "user"
                                    ? "rgba(34,177,76,0.45)"
                                    : "rgba(214,40,40,0.45)",
                                fontSize: "0.48rem",
                              }}
                            >
                              {subscores}
                            </span>
                          )}
                        </>
                      );
                    })()}
                </div>
              )}
            </div>
          </div>
          );
        })}

        {/* Streaming typewriter reply */}
        {latestAgentText !== null && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ fontSize: 18, flexShrink: 0, marginTop: 4 }}>
              {boss.agent.emoji}
            </div>
            <div
              className="dialog-box dialog-box--active"
              style={{
                maxWidth: "75%",
                fontSize: "0.75rem",
                lineHeight: 1.9,
                borderColor: "var(--nes-red)",
                boxShadow: "3px 3px 0 var(--nes-red)",
              }}
            >
              <TypewriterText
                key={latestAgentText}
                text={latestAgentText}
                onDone={() => handleAgentTypingDone(latestAgentText)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Outcome */}
      {outcome && (
        <div
          style={{
            padding: 20,
            textAlign: "center",
            border: `4px solid ${outcome === "user" ? "var(--nes-green)" : "var(--nes-red)"}`,
            background: "var(--nes-darkgray)",
            animation: "fade-in 400ms ease",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: "1.2rem" }}>
            {outcome === "user" ? "🏆" : "💀"}
          </div>
          <h2
            style={{
              fontSize: "0.9rem",
              color: outcome === "user" ? "var(--nes-green)" : "var(--nes-red)",
            }}
          >
            {outcome === "user" ? "VICTORY!" : "DEFEATED!"}
          </h2>
          {outcome === "user" ? (
            <p style={{ fontSize: "0.65rem", color: "var(--nes-gray)" }}>
              You defeated {boss.agent.name}!
            </p>
          ) : (
            <p
              style={{
                fontSize: "0.65rem",
                color: "var(--nes-yellow)",
                maxWidth: 480,
                lineHeight: 2,
                textAlign: "center",
              }}
            >
              {defeatReason ?? `${boss.agent.name} countered your argument.`}
            </p>
          )}
          <p
            style={{
              fontSize: "0.6rem",
              color: "var(--nes-gray)",
              marginTop: 4,
            }}
          >
            {outcome === "agent"
              ? "Return to stage select to retry this boss from the start."
              : ""}
          </p>
          <button
            className="pixel-btn pixel-btn--green"
            onClick={() => navigate("/stage-select")}
            style={{ fontSize: "0.75rem" }}
          >
            STAGE SELECT
          </button>
        </div>
      )}

      {/* Input */}
      {!outcome && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <textarea
              className="pixel-input"
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Make your argument... (Enter to attack)"
              disabled={sending || openingLoading}
              style={{
                flex: 1,
                resize: "none",
                lineHeight: 1.7,
                fontSize: "0.75rem",
              }}
            />
            <button
              className="pixel-btn pixel-btn--red"
              onClick={() => void handleSend()}
              disabled={sending || openingLoading || !input.trim()}
              title="Attack"
              style={{
                alignSelf: "stretch",
                width: 56,
                padding: 0,
                fontSize: "1.6rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {sending ? <span style={{ fontSize: "0.6rem" }}>...</span> : "⚔"}
            </button>
            <button
              className="pixel-btn"
              onClick={() => setGiveUpOpen(true)}
              disabled={sending || openingLoading}
              title="Give Up"
              style={{
                alignSelf: "stretch",
                width: 56,
                padding: 0,
                fontSize: "1.4rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderColor: "var(--nes-gray)",
                boxShadow: "4px 4px 0 rgba(0,0,0,0.6)",
              }}
            >
              🏳️
            </button>
          </div>
        </div>
      )}

      {/* Give Up confirmation */}
      {giveUpOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setGiveUpOpen(false)}
        >
          <div
            style={{
              background: "var(--nes-darkgray)",
              border: "4px solid var(--nes-gray)",
              boxShadow: "6px 6px 0 var(--nes-gray)",
              padding: "28px 32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "2rem" }}>🏳️</div>
            <h2 style={{ fontSize: "0.85rem", color: "var(--nes-yellow)" }}>
              CONCEDE?
            </h2>
            <p
              style={{
                fontSize: "0.6rem",
                color: "var(--nes-gray)",
                lineHeight: 2,
              }}
            >
              You will return to stage select.
              <br />
              This battle will reset.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="pixel-btn pixel-btn--red"
                style={{ fontSize: "0.7rem" }}
                onClick={() => navigate("/stage-select")}
              >
                CONCEDE
              </button>
              <button
                className="pixel-btn"
                style={{ fontSize: "0.7rem" }}
                onClick={() => setGiveUpOpen(false)}
              >
                FIGHT ON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
