import { useState } from "react";
import { useGameName } from "../store/configStore";

/**
 * Shown when the app can't reach the backend at startup (after retries). Instead
 * of silently assuming self-host mode, we surface the problem and let the user
 * retry once the server is up.
 */
export default function ConnectionError({
  onRetry,
}: {
  onRetry: () => Promise<unknown>;
}) {
  const gameName = useGameName();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      className="screen"
      style={{
        gap: 28,
        maxWidth: 520,
        margin: "0 auto",
        width: "100%",
        padding: "56px 24px",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "1.5rem",
          letterSpacing: 3,
          color: "var(--nes-red)",
        }}
      >
        CAN'T REACH THE SERVER
      </h1>
      <p
        style={{ fontSize: "0.75rem", color: "var(--nes-gray)", lineHeight: 2 }}
      >
        {gameName.toUpperCase()} can't reach its game server right now. Make
        sure it's running, then try again.
      </p>
      <button
        className="pixel-btn"
        style={{ fontSize: "0.8rem", padding: "10px 18px" }}
        onClick={retry}
        disabled={retrying}
      >
        <span className="pixel-arrow">▶</span>{" "}
        {retrying ? "RETRYING…" : "RETRY"}
      </button>
    </div>
  );
}
