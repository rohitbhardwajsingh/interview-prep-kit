import type { Config } from "tailwindcss";

/**
 * Provenance is the one thing the palette has to communicate, so the three
 * states get named colours rather than ad-hoc classes: generated is quiet,
 * edited is the user's own, pinned is protected.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0b0e14",
          soft: "#141925",
          line: "#232a3a",
        },
        paper: "#e8ecf5",
        muted: "#8b95ad",
        generated: "#8b95ad",
        edited: "#4ea1ff",
        pinned: "#ffb347",
        good: "#3ddc97",
        warn: "#ffb347",
        bad: "#ff5c7c",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-line": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 200ms ease-out",
        "pulse-line": "pulse-line 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
