import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/gameStore";
import { useChiptune } from "../hooks/useChiptune";
import { useGameName } from "../store/configStore";

const SAMPLE_IDEAS = [
  "Remote work boosts team output",
  "AI kills more jobs than it creates",
  "Sleep matters more than exercise",
  "Social media harms more than helps",
  "Nuclear is the best clean energy",
];

export default function IdeaEntryScreen() {
  const navigate = useNavigate();
  const { blip, attack } = useChiptune();
  const { pendingIdea, setPendingIdea, clearSession } = useGameStore();
  const gameName = useGameName();

  const [idea, setIdea] = useState(pendingIdea);

  const handleContinue = () => {
    const trimmed = idea.trim();
    if (!trimmed) return;
    attack();
    clearSession();
    setPendingIdea(trimmed);
    navigate("/gatekeeper");
  };

  return (
    <div
      className="screen"
      style={{
        gap: 28,
        maxWidth: 720,
        margin: "0 auto",
        width: "100%",
        padding: "28px 20px",
      }}
    >
      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <h1
          className="text-cyan animate-glow"
          style={{ fontSize: "1.6rem", marginBottom: 10, letterSpacing: 4 }}
        >
          {gameName.toUpperCase()}
        </h1>
        <p
          style={{
            fontSize: "0.8rem",
            color: "var(--nes-gray)",
            lineHeight: 1.6,
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
            fontSize: "0.9rem",
            marginBottom: 10,
            color: "var(--nes-yellow)",
          }}
        >
          WHAT IS YOUR IDEA?
        </label>
        <textarea
          className="pixel-input"
          rows={3}
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
          style={{ resize: "none", lineHeight: 1.6, fontSize: "0.95rem" }}
        />
      </div>

      {/* Sample ideas */}
      <div style={{ width: "100%" }}>
        <p
          style={{
            fontSize: "0.7rem",
            color: "var(--nes-gray)",
            marginBottom: 8,
          }}
        >
          OR TRY ONE OF THESE:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SAMPLE_IDEAS.map((s) => (
            <button
              key={s}
              className="pixel-btn"
              style={{
                fontSize: "0.68rem",
                padding: "8px 12px",
                textAlign: "left",
              }}
              onClick={() => {
                blip();
                setIdea(s);
              }}
            >
              <span className="pixel-arrow">▶</span> {s}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom nav: back pinned left, forward pinned right */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
          marginTop: 4,
        }}
      >
        <button
          className="pixel-btn"
          style={{
            fontSize: "0.75rem",
            padding: "10px 16px",
            whiteSpace: "nowrap",
          }}
          onClick={() => {
            blip();
            navigate("/");
          }}
        >
          <span className="pixel-arrow">◀</span> BACK
        </button>

        <button
          className="pixel-btn pixel-btn--green"
          style={{
            fontSize: "0.85rem",
            padding: "12px 24px",
            whiteSpace: "nowrap",
            opacity: idea.trim() ? 1 : 0.4,
            cursor: idea.trim() ? "pointer" : "not-allowed",
          }}
          onClick={handleContinue}
          disabled={!idea.trim()}
        >
          FACE THE GATEKEEPER <span className="pixel-arrow">▶</span>
        </button>
      </div>
    </div>
  );
}
