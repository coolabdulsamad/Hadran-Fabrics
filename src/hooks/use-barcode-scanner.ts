import { useEffect, useRef } from "react";

/**
 * HADRAN FABRICS MALL — USB barcode scanner hook (keyboard-wedge mode).
 *
 * USB scanners type the code very fast and finish with Enter.
 * We detect that burst pattern globally and fire onScan(code).
 * Manual typing never triggers it (too slow between keys).
 *
 * Elements marked with `data-no-scan` (dialogs, quantity inputs) are ignored.
 */
export function useBarcodeScanner({
  enabled = true,
  minLength = 6,
  suffix = "ENTER",
  onScan,
}: {
  enabled?: boolean;
  minLength?: number;
  /** Terminator key the scanner is configured to send (Settings → Hardware). */
  suffix?: "ENTER" | "TAB";
  onScan: (code: string) => void;
}) {
  const buffer = useRef<string>("");
  const lastKeyAt = useRef<number>(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-no-scan]")) {
        buffer.current = "";
        return;
      }

      const now = performance.now();
      const gap = now - lastKeyAt.current;
      lastKeyAt.current = now;

      // A pause over 120ms means a new burst (or manual typing) — reset.
      if (gap > 120) buffer.current = "";

      const isTerminator = suffix === "TAB" ? e.key === "Tab" : e.key === "Enter";
      if (isTerminator) {
        const code = buffer.current;
        buffer.current = "";
        if (code.length >= minLength) {
          e.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      if (e.key.length === 1) {
        // Scanners fire keys ~10–40ms apart; humans rarely below ~60ms sustained.
        if (gap < 90 || buffer.current.length === 0) {
          buffer.current += e.key;
        } else {
          buffer.current = e.key;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, minLength, suffix]);
}
