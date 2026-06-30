import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { waitlistApi, ApiError } from "../lib/api";
import { useChiptune } from "../hooks/useChiptune";
import { useGameName } from "../store/configStore";

/**
 * Shown when the deployment is not accepting new players (hosted spend cap
 * reached). Players can leave an email to be notified when the game reopens.
 */
export default function WaitlistScreen() {
  const navigate = useNavigate();
  const { blip, attack } = useChiptune();
  const gameName = useGameName();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim()) return;
    setStatus("saving");
    setError(null);
    try {
      await waitlistApi.signup(email.trim());
      attack();
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof ApiError ? e.detail : "Could not sign you up");
    }
  };

  return (
    <div
      className="screen"
      style={{
        gap: 28,
        maxWidth: 620,
        margin: "0 auto",
        width: "100%",
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <h1
        className="text-cyan animate-glow"
        style={{ fontSize: "1.6rem", letterSpacing: 3 }}
      >
        {gameName.toUpperCase()}
      </h1>

      <p style={{ fontSize: "0.8rem", color: "var(--nes-yellow)", lineHeight: 2 }}>
        {gameName.toUpperCase()} is not accepting new players at this time.
      </p>
      <p style={{ fontSize: "0.7rem", color: "var(--nes-gray)", lineHeight: 2 }}>
        Sign up for notifications and we'll email you when it becomes available.
      </p>

      {status === "done" ? (
        <p style={{ fontSize: "0.8rem", color: "var(--nes-green)" }}>
          ✓ You're on the list — we'll be in touch.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <input
            className="pixel-input"
            type="email"
            value={email}
            autoFocus
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            style={{ fontSize: "0.85rem", textAlign: "center" }}
          />
          {error && (
            <p style={{ fontSize: "0.65rem", color: "var(--nes-red)" }}>{error}</p>
          )}
          <button
            className="pixel-btn pixel-btn--green"
            style={{
              fontSize: "0.9rem",
              padding: "14px 32px",
              opacity: email.trim() ? 1 : 0.4,
              cursor: email.trim() ? "pointer" : "not-allowed",
            }}
            onClick={() => void submit()}
            disabled={!email.trim() || status === "saving"}
          >
            {status === "saving" ? "SIGNING UP…" : "NOTIFY ME ►"}
          </button>
        </div>
      )}

      <button
        className="pixel-btn"
        style={{ fontSize: "0.7rem", padding: "8px 14px", alignSelf: "center" }}
        onClick={() => {
          blip();
          navigate("/");
        }}
      >
        ◀ BACK
      </button>
    </div>
  );
}
