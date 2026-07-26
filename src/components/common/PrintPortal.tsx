import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * HADRAN FABRICS MALL — print portal.
 * Mounts content into a dedicated top-level #print-root element on <body>.
 * In @media print, every other body child is display:none'd, so ONLY this
 * content reaches the printer — no visibility hacks, no clipped transforms.
 */

const ROOT_ID = "print-root";

function ensureRoot(): HTMLElement {
  let el = document.getElementById(ROOT_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

export function PrintPortal({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setRoot(ensureRoot());
  }, []);

  useEffect(() => {
    if (!root) return;
    return () => {
      // Clean up when the last print consumer unmounts.
      if (root.childElementCount === 0) root.remove();
    };
  }, [root]);

  if (!root) return null;
  return createPortal(children, root);
}
