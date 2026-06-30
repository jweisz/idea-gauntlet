import { useState } from "react";
import { useAudioStore } from "../store/audioStore";
import { getAudioContext } from "../hooks/useChiptune";
import SettingsModal from "./SettingsModal";

export default function AudioControls() {
  const { musicEnabled, sfxEnabled, toggleMusic, toggleSfx } = useAudioStore();
  const [showSettings, setShowSettings] = useState(false);

  const base: React.CSSProperties = {
    background: "var(--nes-darkgray)",
    border: "3px solid var(--nes-gray)",
    color: "var(--nes-white)",
    fontFamily: "inherit",
    fontSize: "0.8rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    whiteSpace: "nowrap",
    transition: "border-color 80ms, background 80ms",
  };

  const active: React.CSSProperties = {
    ...base,
    borderColor: "var(--nes-cyan)",
    background: "rgba(66,197,245,0.1)",
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 1000,
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      {/* ── BGM toggle ─────────────────────────────────────────────── */}
      <button
        style={musicEnabled ? active : base}
        onClick={() => {
          void getAudioContext().resume();
          toggleMusic();
        }}
        title={musicEnabled ? "Music ON — click to mute" : "Music OFF — click to enable"}
      >
        <span>{musicEnabled ? "🎵" : "🔇"}</span>
        <span style={{ fontSize: "0.65rem", color: musicEnabled ? "var(--nes-cyan)" : "var(--nes-gray)" }}>
          BGM
        </span>
      </button>

      {/* ── SFX toggle ─────────────────────────────────────────────── */}
      <button
        style={sfxEnabled ? active : base}
        onClick={toggleSfx}
        title={sfxEnabled ? "SFX ON — click to mute" : "SFX OFF — click to enable"}
      >
        <span>{sfxEnabled ? "🔊" : "🔕"}</span>
        <span style={{ fontSize: "0.65rem", color: sfxEnabled ? "var(--nes-cyan)" : "var(--nes-gray)" }}>
          SFX
        </span>
      </button>

      {/* ── Settings ───────────────────────────────────────────────── */}
      <button
        style={
          showSettings
            ? { ...active, borderColor: "var(--nes-yellow)", background: "rgba(245,197,66,0.1)" }
            : base
        }
        onClick={() => setShowSettings((s) => !s)}
        title="Settings"
      >
        <span>⚙</span>
        <span style={{ fontSize: "0.65rem", color: showSettings ? "var(--nes-yellow)" : "var(--nes-gray)" }}>
          SETTINGS
        </span>
      </button>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
