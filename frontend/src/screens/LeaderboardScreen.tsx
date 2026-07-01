import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { leaderboardApi, ApiError, type LeaderboardEntryOut } from "../lib/api";
import { useChiptune } from "../hooks/useChiptune";

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "var(--nes-green)",
  normal: "var(--nes-yellow)",
  difficult: "var(--nes-red)",
};

export default function LeaderboardScreen() {
  const navigate = useNavigate();
  const { blip } = useChiptune();
  const [entries, setEntries] = useState<LeaderboardEntryOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leaderboardApi
      .list()
      .then(setEntries)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.detail : "Failed to load leaderboard",
        ),
      );
  }, []);

  return (
    <div
      className="screen"
      style={{
        gap: 24,
        maxWidth: 760,
        margin: "0 auto",
        width: "100%",
        padding: "40px 24px",
      }}
    >
      <h1
        className="text-yellow animate-glow"
        style={{ fontSize: "1.6rem", letterSpacing: 3, textAlign: "center" }}
      >
        🏆 LEADERBOARD
      </h1>

      {error && (
        <p style={{ fontSize: "0.75rem", color: "var(--nes-red)" }}>{error}</p>
      )}
      {!error && entries === null && (
        <p style={{ fontSize: "0.75rem", color: "var(--nes-gray)" }}>
          LOADING…
        </p>
      )}
      {!error && entries !== null && entries.length === 0 && (
        <p style={{ fontSize: "0.75rem", color: "var(--nes-gray)" }}>
          No published runs yet — be the first to publish a victory.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries?.map((e, i) => (
          <div
            key={e.id}
            style={{
              border: "2px solid var(--nes-gray)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 10,
              }}
            >
              <span style={{ fontSize: "0.85rem", color: "var(--nes-cyan)" }}>
                #{i + 1} {e.user_display_name}
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--nes-yellow)" }}>
                {e.score} pts
              </span>
            </div>

            <div style={{ fontSize: "0.75rem", lineHeight: 1.6 }}>
              “{e.idea}”
            </div>
            <div
              style={{
                fontSize: "0.65rem",
                color: "var(--nes-gray)",
                lineHeight: 1.7,
              }}
            >
              {e.defense_summary}
            </div>

            <div
              style={{
                fontSize: "0.6rem",
                color: "var(--nes-gray)",
                letterSpacing: 1,
              }}
            >
              <span
                style={{
                  color: DIFFICULTY_COLOR[e.difficulty] ?? "var(--nes-gray)",
                }}
              >
                {e.difficulty.toUpperCase()}
              </span>{" "}
              · {e.bosses_defeated}/{e.total_bosses} DEFEATED ·{" "}
              {e.avg_turns_per_boss} TURNS/BOSS · {e.avg_damage_per_attack}{" "}
              DMG/HIT
            </div>

            {e.defeated_bosses.length > 0 && (
              <div style={{ fontSize: "0.55rem", color: "var(--nes-green)" }}>
                ✓ {e.defeated_bosses.join(" · ")}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        className="pixel-btn"
        style={{
          alignSelf: "flex-start",
          fontSize: "0.75rem",
          padding: "8px 14px",
        }}
        onClick={() => {
          blip();
          navigate("/");
        }}
      >
        <span className="pixel-arrow">◀</span> YOUR GAMES
      </button>
    </div>
  );
}
