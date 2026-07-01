import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/gameStore";
import { useChiptune } from "../hooks/useChiptune";
import { gauntlet, ApiError, type IdeaCheckCategory } from "../lib/api";

type Phase = "checking" | "approved" | "rejected" | "error";

const CATEGORY_LABEL: Record<IdeaCheckCategory, string> = {
  ok: "PASSABLE",
  prompt_injection: "SUSPICIOUS INPUT",
  unsafe: "FORBIDDEN TOPIC",
  no_position: "NOT A POSITION",
  undebatable: "NOT DEBATABLE",
};

export default function GatekeeperScreen() {
  const navigate = useNavigate();
  const pendingIdea = useGameStore((s) => s.pendingIdea);
  const { blip, gatekeeperApprove, gatekeeperReject } = useChiptune();

  const [phase, setPhase] = useState<Phase>("checking");
  const [category, setCategory] = useState<IdeaCheckCategory>();
  const [reason, setReason] = useState<string>();
  const [dots, setDots] = useState(1);

  const check = () => {
    gauntlet
      .checkIdea(pendingIdea)
      .then((result) => {
        if (result.passed) {
          setPhase("approved");
        } else {
          setCategory(result.category);
          setReason(result.reason);
          setPhase("rejected");
        }
      })
      .catch((e) => {
        setReason(e instanceof ApiError ? e.detail : undefined);
        setPhase("error");
      });
  };

  const retry = () => {
    setPhase("checking");
    check();
  };

  useEffect(() => {
    if (!pendingIdea.trim()) {
      navigate("/new", { replace: true });
      return;
    }
    // Initial phase is already "checking" — just kick off the request.
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated "..." while the gatekeeper is thinking.
  useEffect(() => {
    if (phase !== "checking") return;
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 400);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "approved") gatekeeperApprove();
    if (phase === "rejected" || phase === "error") gatekeeperReject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const isBad = phase === "rejected" || phase === "error";
  const color =
    phase === "approved"
      ? "var(--nes-green)"
      : isBad
        ? "var(--nes-red)"
        : "var(--nes-cyan)";

  return (
    <div
      className="screen"
      style={{
        gap: 24,
        maxWidth: 720,
        margin: "0 auto",
        width: "100%",
        padding: "28px 20px",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontSize: "0.7rem",
            color: "var(--nes-gray)",
            marginBottom: 8,
            letterSpacing: 1,
          }}
        >
          YOUR IDEA
        </p>
        <div
          className="dialog-box"
          style={{ fontSize: "0.8rem", maxWidth: 560 }}
        >
          &ldquo;{pendingIdea}&rdquo;
        </div>
      </div>

      <div
        className={`sprite ${phase === "checking" ? "sprite--idle" : isBad ? "sprite--shake" : ""}`}
        style={{ fontSize: 88, filter: `drop-shadow(0 0 12px ${color})` }}
      >
        🗿
      </div>

      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--nes-gray)",
          letterSpacing: 1,
        }}
      >
        THE GATEKEEPER
      </p>

      {phase === "checking" && (
        <p style={{ fontSize: "0.85rem" }}>
          EXAMINING YOUR IDEA{".".repeat(dots)}
        </p>
      )}

      {phase === "approved" && (
        <p
          className="animate-glow"
          style={{ fontSize: "0.9rem", color, textAlign: "center" }}
        >
          YOUR IDEA STANDS. THE GATE OPENS.
        </p>
      )}

      {(phase === "rejected" || phase === "error") && (
        <>
          <p style={{ fontSize: "0.8rem", color, letterSpacing: 1 }}>
            ◆{" "}
            {phase === "error"
              ? "THE GATE WILL NOT OPEN"
              : CATEGORY_LABEL[category ?? "no_position"]}
          </p>
          <div
            className="dialog-box"
            style={{ fontSize: "0.8rem", maxWidth: 560, textAlign: "center" }}
          >
            {reason ||
              (phase === "error"
                ? "The gatekeeper is unreachable. Check your connection and try again."
                : "This idea will not be permitted to pass.")}
          </div>
        </>
      )}

      {/* Bottom nav: back-ish action pinned left, forward-ish action pinned right */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
          marginTop: 12,
        }}
      >
        <button
          className="pixel-btn"
          style={{
            fontSize: "0.65rem",
            padding: "10px 14px",
            whiteSpace: "nowrap",
          }}
          onClick={() => {
            blip();
            navigate("/new");
          }}
        >
          ◀ REVISE
        </button>

        {phase === "approved" && (
          <button
            className="pixel-btn pixel-btn--green"
            style={{
              fontSize: "0.75rem",
              padding: "12px 20px",
              whiteSpace: "nowrap",
            }}
            onClick={() => {
              blip();
              navigate("/choose-challengers");
            }}
          >
            CHOOSE YOUR CHALLENGERS ►
          </button>
        )}

        {phase === "error" && (
          <button
            className="pixel-btn pixel-btn--yellow"
            style={{
              fontSize: "0.75rem",
              padding: "12px 20px",
              whiteSpace: "nowrap",
            }}
            onClick={retry}
          >
            ⟳ RETRY
          </button>
        )}
      </div>
    </div>
  );
}
