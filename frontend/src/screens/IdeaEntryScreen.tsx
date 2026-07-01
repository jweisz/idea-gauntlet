import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/gameStore";
import { useChiptune } from "../hooks/useChiptune";
import { useGameName } from "../store/configStore";

const SAMPLE_IDEAS = [
  "Remote work makes teams more productive",
  "AI will eliminate more jobs than it creates",
  "Sleep is more important than exercise for health",
  "Social media has done more harm than good",
  "Nuclear energy is the best path to clean power",
];

export default function IdeaEntryScreen() {
  const navigate = useNavigate();
  const { blip, attack } = useChiptune();
  const { setPendingIdea, clearSession } = useGameStore();
  const gameName = useGameName();

  const [idea, setIdea] = useState("");

  const handleContinue = () => {
    if (!idea.trim()) return;
    attack();
    clearSession();
    setPendingIdea(idea.trim());
    navigate("/choose-challengers");
  };

  return (
    <div
      className="screen"
      style={{
        gap: 40,
        maxWidth: 720,
        margin: "0 auto",
        width: "100%",
        padding: "40px 24px",
      }}
    >
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
        ◀ YOUR GAMES
      </button>

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <h1
          className="text-cyan animate-glow"
          style={{ fontSize: "2rem", marginBottom: 16, letterSpacing: 4 }}
        >
          {gameName.toUpperCase()}
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--nes-gray)",
            lineHeight: 2,
          }}
        >
          DEFEND YOUR IDEA AGAINST 8 CRITICS
        </p>
      </div>

      {/* Idea input */}
      <div style={{ width: "100%" }}>
        <label
          style={{
            display: "block",
            fontSize: "1rem",
            marginBottom: 12,
            color: "var(--nes-yellow)",
          }}
        >
          WHAT IS YOUR IDEA?
        </label>
        <textarea
          className="pixel-input"
          rows={4}
          value={idea}
          autoFocus
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleContinue();
            }
          }}
          placeholder="State your idea clearly and boldly..."
          style={{ resize: "none", lineHeight: 2, fontSize: "1rem" }}
        />
      </div>

      {/* Sample ideas */}
      <div style={{ width: "100%" }}>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--nes-gray)",
            marginBottom: 12,
          }}
        >
          OR TRY ONE OF THESE:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SAMPLE_IDEAS.map((s) => (
            <button
              key={s}
              className="pixel-btn"
              style={{
                fontSize: "0.75rem",
                padding: "10px 14px",
                textAlign: "left",
              }}
              onClick={() => {
                blip();
                setIdea(s);
              }}
            >
              ▶ {s}
            </button>
          ))}
        </div>
      </div>

      <button
        className="pixel-btn pixel-btn--green"
        style={{
          fontSize: "1rem",
          padding: "18px 48px",
          opacity: idea.trim() ? 1 : 0.4,
          cursor: idea.trim() ? "pointer" : "not-allowed",
        }}
        onClick={handleContinue}
        disabled={!idea.trim()}
      >
        CHOOSE YOUR CHALLENGERS ►
      </button>
    </div>
  );
}
