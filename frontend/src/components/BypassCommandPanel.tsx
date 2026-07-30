/**
 * The "/bypass" dev command prompt — a fixed panel in the bottom-right corner.
 * Its state and behavior live in hooks/useBypassCommand.
 */
import type { BypassCommand } from "../hooks/useBypassCommand";

export default function BypassCommandPanel({
  state,
}: {
  state: BypassCommand;
}) {
  const { open, value, setValue, inputRef, close, run } = state;
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 1000,
        background: "var(--nes-darkgray)",
        border: "3px solid var(--nes-cyan)",
        boxShadow: "4px 4px 0 var(--nes-cyan)",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 220,
      }}
    >
      <div style={{ fontSize: "0.55rem", color: "var(--nes-cyan)" }}>
        COMMAND
      </div>
      <input
        ref={inputRef}
        className="pixel-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.nativeEvent.stopImmediatePropagation();
            void run();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.nativeEvent.stopImmediatePropagation();
            close();
          }
        }}
        style={{ fontSize: "0.7rem", padding: "6px 8px", width: "100%" }}
        spellCheck={false}
        autoComplete="off"
      />
      <div style={{ fontSize: "0.5rem", color: "var(--nes-gray)" }}>
        ENTER to run · ESC to cancel
      </div>
    </div>
  );
}
