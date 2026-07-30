/**
 * 1-D keyboard cursor for a linear gauntlet path.
 *
 *   [0]───[1]───[2]───[★]
 *
 * Arrow keys move by one and **clamp** at the ends rather than wrapping: a path
 * has a start and a finish, and looping from the last node back to the first
 * would misrepresent that. Up/Down are accepted as aliases for Left/Right
 * because the path wraps onto multiple rows on narrow viewports, where "down"
 * is the natural way to reach the next node.
 *
 * The sibling useGridCursor covers the free-choice 3x3 layout.
 */
import { useState, useEffect, useLayoutEffect, useRef } from "react";

const BACKWARD = ["ArrowLeft", "ArrowUp"];
const FORWARD = ["ArrowRight", "ArrowDown"];

export function useLinearCursor({
  length,
  initial = 0,
  onSelect,
  onBack,
  enabled = true,
  onMove,
}: {
  /** Number of selectable positions, 0..length-1. */
  length: number;
  /** Where the cursor starts — typically the next boss to fight. */
  initial?: number;
  onSelect: (pos: number) => void;
  onBack?: () => void;
  enabled?: boolean;
  onMove?: () => void;
}) {
  const [cursor, setCursor] = useState(initial);

  // Re-home the cursor when the intended starting position changes — e.g. after
  // a victory, so ENTER on arrival fights the boss that is now next. Adjusted
  // during render rather than in an effect: React re-renders before touching
  // the DOM, so the cursor never paints in its stale position.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setCursor(initial);
  }

  const cursorRef = useRef(cursor);
  const lengthRef = useRef(length);
  const onSelectRef = useRef(onSelect);
  const onBackRef = useRef(onBack);
  const onMoveRef = useRef(onMove);

  useLayoutEffect(() => {
    cursorRef.current = cursor;
    lengthRef.current = length;
    onSelectRef.current = onSelect;
    onBackRef.current = onBack;
    onMoveRef.current = onMove;
  });

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const step = BACKWARD.includes(e.key)
        ? -1
        : FORWARD.includes(e.key)
          ? 1
          : 0;
      if (step !== 0) {
        e.preventDefault();
        setCursor((prev) =>
          Math.min(
            Math.max(prev + step, 0),
            Math.max(lengthRef.current - 1, 0),
          ),
        );
        onMoveRef.current?.();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelectRef.current(cursorRef.current);
      } else if (e.key === "Escape") {
        onBackRef.current?.();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);

  return { cursor, setCursor };
}
