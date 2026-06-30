/**
 * 3×3 grid keyboard cursor — Mega Man style.
 *
 * Positions:
 *   [0][1][2]
 *   [3][4][5]   ← 4 is always the centre tile
 *   [6][7][8]
 *
 * Arrow keys wrap within their row/column.
 */
import { useState, useEffect, useLayoutEffect, useRef } from "react";

const NAV = {
  ArrowUp: [6, 7, 8, 0, 1, 2, 3, 4, 5],
  ArrowDown: [3, 4, 5, 6, 7, 8, 0, 1, 2],
  ArrowLeft: [2, 0, 1, 5, 3, 4, 8, 6, 7],
  ArrowRight: [1, 2, 0, 4, 5, 3, 7, 8, 6],
} as const;

type NavKey = keyof typeof NAV;

export function useGridCursor({
  onSelect,
  onBack,
  enabled = true,
  onMove,
  skipPositions = [],
}: {
  onSelect: (pos: number) => void;
  onBack?: () => void;
  enabled?: boolean;
  onMove?: () => void;
  skipPositions?: number[];
}) {
  const [cursor, setCursor] = useState(0);

  const cursorRef = useRef(cursor);
  const onSelectRef = useRef(onSelect);
  const onBackRef = useRef(onBack);
  const onMoveRef = useRef(onMove);
  const skipRef = useRef(skipPositions);

  useLayoutEffect(() => {
    cursorRef.current = cursor;
    onSelectRef.current = onSelect;
    onBackRef.current = onBack;
    onMoveRef.current = onMove;
    skipRef.current = skipPositions;
  });

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key in NAV) {
        e.preventDefault();
        setCursor((prev) => {
          let next = NAV[e.key as NavKey][prev];
          if (skipRef.current.includes(next)) next = NAV[e.key as NavKey][next];
          return next;
        });
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
