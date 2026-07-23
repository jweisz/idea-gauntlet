import { useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAudioStore } from "../store/audioStore";
import { useUIStore } from "../store/uiStore";
import { getAudioContext } from "../hooks/useChiptune";
import { useConfigStore } from "../store/configStore";
import CreditsBadge from "./CreditsBadge";
import SettingsModal from "./SettingsModal";

/**
 * Credits / BGM / SFX / Settings controls, anchored to the top-right of the
 * window.
 *
 * They collapse in two steps as they run out of room: full labels → icons only
 * → vertical stack. Screens mark what the controls have to stay clear of, and
 * we measure the rightmost marked edge against the space the row needs.
 * Measuring — rather than hard-coding viewport breakpoints — keeps it correct
 * regardless of font metrics, how long a title is, or how wide the row itself
 * has grown (the credits badge adds to it).
 *
 * Two markers, because there are two ways to be in the way:
 *
 * - `.toolbar-clearance` — something the controls would sit *on top of*: a
 *   screen title, the battle HP panel. Only counts while level with the
 *   controls. Screens are vertically centered, so a short one (the home screen)
 *   sits its title far below the toolbar, where it collides with nothing, while
 *   a tall one (challenger select) pushes the same title right up alongside it.
 *   Mark the *inline* extent of a heading, not the block: a centered `<h1>` is
 *   full-width, so its rect would claim a collision the glyphs don't — wrap the
 *   text in a `<span className="toolbar-clearance">`.
 *
 * - `.toolbar-clearance--column` (used alongside the base class) — the screen's
 *   content column: the battle transcript. Counts at any height, because the
 *   controls should live in the column's right gutter rather than hanging over
 *   it, even where they don't literally overlap. Use it sparingly: a screen
 *   whose column is far below the controls (challenger select) collapses them
 *   for no visible reason, and labels flickering on and off between screens is
 *   worse than a bit of unused gutter.
 */
type Mode = "full" | "icons" | "stack";

/** Screen elements the top-right controls must stay clear of. */
const CLEARANCE_SELECTOR = ".toolbar-clearance";
/** Of those, the ones that count at any height (see above). */
const COLUMN_CLASS = "toolbar-clearance--column";

export default function AudioControls() {
  const { musicEnabled, sfxEnabled, toggleMusic, toggleSfx } = useAudioStore();
  const {
    settingsOpen: showSettings,
    openSettings,
    closeSettings,
  } = useUIStore();

  const creditsEnabled = useConfigStore((s) => s.config?.credits_enabled);

  const location = useLocation();
  const [mode, setMode] = useState<Mode>("full");
  const containerRef = useRef<HTMLDivElement>(null);
  // Geometry of the controls in the uncollapsed layout, measured once while
  // labels are visible (mode === "full") and reused on later resizes.
  const rowRef = useRef<{ full: number; icons: number; height: number } | null>(
    null,
  );
  // Read inside recompute so the observers below don't have to be torn down and
  // rebuilt every time the mode flips — rebuilding a body-wide MutationObserver
  // mid-resize is exactly the kind of churn that stalls a drag.
  const modeRef = useRef<Mode>(mode);
  useLayoutEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useLayoutEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;

      // Measure the labeled + icon-only row widths while the labels are in the
      // DOM. Only possible in "full"; cached for the collapsed modes.
      if (modeRef.current === "full") {
        const rect = el.getBoundingClientRect();
        let labels = 0;
        el.querySelectorAll<HTMLElement>(".audio-controls__label").forEach(
          // + the 6px flex gap between icon and label, which also collapses
          (l) => (labels += l.offsetWidth + 6),
        );
        rowRef.current = {
          full: rect.width,
          icons: Math.max(0, rect.width - labels),
          height: rect.height,
        };
      }
      const row = rowRef.current;
      if (!row) return;

      const TOP_INSET = 12;
      const RIGHT_INSET = 12;
      const GAP = 12;
      // Vertical band the controls occupy uncollapsed. Pinned to the
      // uncollapsed height so the band can't grow with the stacked layout and
      // sustain its own collapse.
      const bandTop = TOP_INSET - 4;
      const bandBottom = TOP_INSET + row.height + 4;

      // Rightmost edge the controls have to stay clear of: overlap targets only
      // while level with us, content columns at any height.
      let clearanceRight = 0;
      document
        .querySelectorAll<HTMLElement>(CLEARANCE_SELECTOR)
        .forEach((n) => {
          const r = n.getBoundingClientRect();
          const column = n.classList.contains(COLUMN_CLASS);
          if (!column && (r.bottom < bandTop || r.top > bandBottom)) return;
          clearanceRight = Math.max(clearanceRight, r.right);
        });

      const leftFor = (w: number) => window.innerWidth - RIGHT_INSET - w;

      const next: Mode =
        leftFor(row.full) >= clearanceRight + GAP
          ? "full"
          : leftFor(row.icons) >= clearanceRight + GAP
            ? "icons"
            : "stack";
      setMode((m) => (m === next ? m : next));
    };

    // Coalesce every trigger — resize, observers, fonts — to one measurement
    // per frame. Resizing fires all of them at once, repeatedly.
    let queued = false;
    const recompute = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        measure();
      });
    };

    measure();
    window.addEventListener("resize", recompute);

    let ro: ResizeObserver | undefined;
    let observed: HTMLElement[] = [];
    const observeMarked = () => {
      if (!ro) return;
      const marked = Array.from(
        document.querySelectorAll<HTMLElement>(CLEARANCE_SELECTOR),
      );
      const unchanged =
        marked.length === observed.length &&
        marked.every((n, i) => n === observed[i]);
      if (unchanged) return;
      observed.forEach((n) => ro?.unobserve(n));
      marked.forEach((n) => ro?.observe(n));
      observed = marked;
      recompute();
    };

    let mo: MutationObserver | undefined;
    if ("ResizeObserver" in window) {
      // Marked elements shift with their content — a long boss name or the
      // player's idea loading in — which fires no resize event.
      ro = new ResizeObserver(recompute);
      observeMarked();
      // The row itself also grows late — the credits badge fills in its balance
      // ("🪙 CREDITS" → "🪙 1 CREDIT") once /credits/me answers. Safe to observe
      // because widths are only measured in "full" mode and cached, so a
      // collapse can't feed back into a re-measure.
      if (containerRef.current) ro.observe(containerRef.current);

      // Some marked elements mount after the screen does (the challenger grid
      // waits on its agents), so watch for them arriving. Coalesced to one
      // check per frame, and it re-measures only when the marked set actually
      // changed — battle chat mutates constantly.
      let moQueued = false;
      mo = new MutationObserver(() => {
        if (moQueued) return;
        moQueued = true;
        requestAnimationFrame(() => {
          moQueued = false;
          observeMarked();
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    // Custom pixel font can change widths after first paint.
    document.fonts?.ready?.then(recompute).catch(() => {});

    return () => {
      window.removeEventListener("resize", recompute);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [location.pathname]);

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
      {/* ── Credits ────────────────────────────────────────────────── */}
      {creditsEnabled && <CreditsBadge variant="toolbar" />}

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
          CFG
        </span>
      </button>

      {showSettings && <SettingsModal onClose={closeSettings} />}
    </div>
  );
}
