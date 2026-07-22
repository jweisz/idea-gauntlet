import { useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAudioStore } from "../store/audioStore";
import { useUIStore } from "../store/uiStore";
import { getAudioContext } from "../hooks/useChiptune";
import SettingsModal from "./SettingsModal";

/**
 * BGM / SFX / Settings controls, anchored to the top-right of the window.
 *
 * They collapse in two steps as they run out of room beside a top-anchored
 * header — in practice only the battle screen's HP panel (marked
 * `.battle-hp-panel`). We measure the panel's right edge against the space the
 * controls need and step down: full labels → icons only → vertical stack. On
 * screens with no such header the controls keep their labels until the viewport
 * itself is narrower than the labeled row. Measuring (rather than hard-coding
 * viewport breakpoints) keeps it correct regardless of font metrics or how wide
 * the panel renders.
 */
type Mode = "full" | "icons" | "stack";

export default function AudioControls() {
  const { musicEnabled, sfxEnabled, toggleMusic, toggleSfx } = useAudioStore();
  const {
    settingsOpen: showSettings,
    openSettings,
    closeSettings,
  } = useUIStore();

  const location = useLocation();
  const [mode, setMode] = useState<Mode>("full");
  const containerRef = useRef<HTMLDivElement>(null);
  // Row widths of the controls in each layout, measured once while labels are
  // visible (mode === "full") and reused on later resizes.
  const rowWidthsRef = useRef<{ full: number; icons: number } | null>(null);

  useLayoutEffect(() => {
    const recompute = () => {
      const el = containerRef.current;
      if (!el) return;

      // Measure the labeled + icon-only row widths while the labels are in the
      // DOM. Only possible in "full"; cached for the collapsed modes.
      if (mode === "full") {
        const full = el.getBoundingClientRect().width;
        let labels = 0;
        el.querySelectorAll<HTMLElement>(".audio-controls__label").forEach(
          // + the 6px flex gap between icon and label, which also collapses
          (l) => (labels += l.offsetWidth + 6),
        );
        rowWidthsRef.current = { full, icons: Math.max(0, full - labels) };
      }
      const widths = rowWidthsRef.current;
      if (!widths) return;

      const panel = document.querySelector<HTMLElement>(".battle-hp-panel");
      const panelRight = panel ? panel.getBoundingClientRect().right : 0;
      const RIGHT_INSET = 12;
      const GAP = 12;
      const leftFor = (w: number) => window.innerWidth - RIGHT_INSET - w;

      const next: Mode =
        leftFor(widths.full) >= panelRight + GAP
          ? "full"
          : leftFor(widths.icons) >= panelRight + GAP
            ? "icons"
            : "stack";
      setMode((m) => (m === next ? m : next));
    };

    recompute();
    window.addEventListener("resize", recompute);
    // The panel's width also shifts with its content (e.g. a long boss name
    // loading in), which fires no resize event — observe it directly.
    const panel = document.querySelector<HTMLElement>(".battle-hp-panel");
    let ro: ResizeObserver | undefined;
    if (panel && "ResizeObserver" in window) {
      ro = new ResizeObserver(recompute);
      ro.observe(panel);
    }
    // Custom pixel font can change widths after first paint.
    document.fonts?.ready?.then(recompute).catch(() => {});

    return () => {
      window.removeEventListener("resize", recompute);
      ro?.disconnect();
    };
  }, [mode, location.pathname]);

  const base: React.CSSProperties = {
    background: "var(--nes-darkgray)",
    // Longhand (not the `border` shorthand) so the `active` variant below can
    // override just borderColor without React warning about mixing shorthand +
    // non-shorthand for the same value.
    borderWidth: 3,
    borderStyle: "solid",
    borderColor: "var(--nes-gray)",
    boxShadow: "4px 4px 0 var(--nes-gray)",
    color: "var(--nes-white)",
    fontFamily: "inherit",
    fontSize: "0.8rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    // Fixed height so all three buttons match regardless of icon glyph
    // metrics — color emoji (🎵/🔊) render taller than a plain "⚙" character,
    // which otherwise leaves the Settings button visibly shorter.
    height: 46,
    gap: 6,
    padding: "6px 10px",
    whiteSpace: "nowrap",
    transition: "border-color 80ms, background 80ms",
  };

  const active: React.CSSProperties = {
    ...base,
    borderColor: "var(--nes-cyan)",
    boxShadow: "4px 4px 0 var(--nes-cyan)",
    background: "rgba(66,197,245,0.1)",
  };

  return (
    <div
      ref={containerRef}
      className={`audio-controls audio-controls--${mode}`}
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 1000,
        display: "flex",
        flexDirection: mode === "stack" ? "column" : "row",
        gap: 8,
        alignItems: mode === "stack" ? "flex-end" : "center",
        maxWidth: "calc(100vw - 24px)",
      }}
    >
      {/* ── BGM toggle ─────────────────────────────────────────────── */}
      <button
        style={musicEnabled ? active : base}
        onClick={() => {
          void getAudioContext().resume();
          toggleMusic();
        }}
        title={
          musicEnabled
            ? "Music ON — click to mute"
            : "Music OFF — click to enable"
        }
      >
        <span>{musicEnabled ? "🔊" : "🔇"}</span>
        <span
          className="audio-controls__label"
          style={{
            fontSize: "0.65rem",
            color: musicEnabled ? "var(--nes-cyan)" : "var(--nes-gray)",
          }}
        >
          BGM
        </span>
      </button>

      {/* ── SFX toggle ─────────────────────────────────────────────── */}
      <button
        style={sfxEnabled ? active : base}
        onClick={toggleSfx}
        title={
          sfxEnabled ? "SFX ON — click to mute" : "SFX OFF — click to enable"
        }
      >
        <span>{sfxEnabled ? "🔊" : "🔕"}</span>
        <span
          className="audio-controls__label"
          style={{
            fontSize: "0.65rem",
            color: sfxEnabled ? "var(--nes-cyan)" : "var(--nes-gray)",
          }}
        >
          SFX
        </span>
      </button>

      {/* ── Settings ───────────────────────────────────────────────── */}
      <button
        style={
          showSettings
            ? {
                ...active,
                borderColor: "var(--nes-yellow)",
                boxShadow: "4px 4px 0 var(--nes-yellow)",
                background: "rgba(245,197,66,0.1)",
              }
            : base
        }
        onClick={() => (showSettings ? closeSettings() : openSettings())}
        title="Settings"
      >
        <span style={{ fontSize: "1.3em" }}>⚙️</span>
        <span
          className="audio-controls__label"
          style={{
            fontSize: "0.65rem",
            color: showSettings ? "var(--nes-yellow)" : "var(--nes-gray)",
          }}
        >
          SETTINGS
        </span>
      </button>

      {showSettings && <SettingsModal onClose={closeSettings} />}
    </div>
  );
}
