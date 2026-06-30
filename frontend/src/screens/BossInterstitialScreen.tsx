import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGameStore } from "../store/gameStore";
import { useChiptune } from "../hooks/useChiptune";

export default function BossInterstitialScreen() {
  const navigate = useNavigate();
  const { bossId } = useParams<{ bossId: string }>();
  const { session } = useGameStore();
  const { bossIntro } = useChiptune();

  const [phase, setPhase] = useState<"warning" | "name" | "ready">("warning");

  const boss = session?.bosses.find((b) => b.id === Number(bossId));

  useEffect(() => {
    if (!boss) {
      navigate("/", { replace: true });
      return;
    }

    bossIntro();

    const t1 = setTimeout(() => setPhase("name"), 900);
    const t2 = setTimeout(() => setPhase("ready"), 2200);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") navigate(`/battle/${bossId}`);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!boss) return null;

  return (
    <div
      className="screen"
      style={{
        background: "var(--nes-black)",
        gap: 40,
        cursor: phase === "ready" ? "pointer" : "default",
      }}
      onClick={() => {
        if (phase === "ready") navigate(`/battle/${bossId}`);
      }}
    >
      {/* WARNING flash */}
      {phase === "warning" && (
        <div
          key="warning"
          className="animate-flash"
          style={{
            fontSize: "2rem",
            color: "var(--nes-red)",
            textAlign: "center",
            animation: "flash 300ms steps(1) 6",
          }}
        >
          WARNING!
        </div>
      )}

      {(phase === "name" || phase === "ready") && (
        <>
          {/* Boss sprite */}
          <div
            className="sprite sprite--idle"
            style={{
              fontSize: 96,
              animation:
                "idle-bounce 800ms steps(2) infinite, slide-in-right 400ms ease forwards",
            }}
          >
            {boss.agent.emoji}
          </div>

          {/* Name */}
          <div
            style={{
              animation: "slide-in-left 400ms ease forwards",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: "0.7rem",
                color: "var(--nes-gray)",
                marginBottom: 8,
              }}
            >
              BOSS APPROACHING
            </p>
            <h2
              className="text-cyan animate-glow"
              style={{ fontSize: "1.2rem" }}
            >
              {boss.agent.name.toUpperCase()}
            </h2>
            <p
              style={{
                fontSize: "0.65rem",
                color: "var(--nes-gray)",
                maxWidth: 400,
                margin: "12px auto 0",
                lineHeight: 2,
                textAlign: "center",
              }}
            >
              {boss.agent.role_description}
            </p>
          </div>

          {phase === "ready" && (
            <div
              style={{
                animation: "blink 600ms step-start infinite",
                fontSize: "0.875rem",
              }}
            >
              ► PRESS [ENTER] TO FIGHT
            </div>
          )}
        </>
      )}
    </div>
  );
}
