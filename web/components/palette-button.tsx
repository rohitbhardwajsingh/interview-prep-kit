"use client";

import { useEffect, useState } from "react";
import { useCommandPalette } from "./command-palette";

/**
 * The palette is the fastest way around the app and nobody discovers a
 * keyboard shortcut by accident, so it also has a visible handle. The
 * modifier is detected rather than hardcoded: showing a Mac user Ctrl is a
 * small lie that makes the hint useless.
 */
export function PaletteButton() {
  const { open } = useCommandPalette();
  const [modifier, setModifier] = useState("Ctrl");

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setModifier("⌘");
  }, []);

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Open the command palette"
      className="hidden items-center gap-2 rounded-lg border border-line
        bg-surface px-2.5 py-1.5 text-xs text-faint transition
        hover:border-line-strong hover:text-dim sm:flex"
    >
      <span>Search</span>
      <kbd className="kbd">{modifier}K</kbd>
    </button>
  );
}
