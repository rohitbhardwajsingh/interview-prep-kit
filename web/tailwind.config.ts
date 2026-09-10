import type { Config } from "tailwindcss";

/**
 * The palette has three jobs, in order of importance.
 *
 * It has to make **depth** legible without drawing a box around everything:
 * five near-black surfaces stacked from void to raised, so hierarchy comes
 * from light rather than from borders.
 *
 * It has to make **state** unmistakable at a glance. Provenance (whose words
 * are these) and readiness (how prepared am I) are the two things the user
 * reads fastest, so both get named scales instead of ad-hoc classes.
 *
 * And it has to stay **quiet**. One accent, used only for things you can act
 * on. Everything decorative is a shade of the background.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Stacked surfaces, darkest first.
        void: "#06070b",
        surface: {
          DEFAULT: "#0c0e15",
          raised: "#12151f",
          high: "#1a1e2b",
        },
        line: {
          DEFAULT: "#1c2130",
          strong: "#2a3145",
        },
        // Text, brightest first.
        paper: "#eef1f8",
        dim: "#98a2ba",
        faint: "#5c6580",

        accent: {
          DEFAULT: "#7c5cff",
          hover: "#8f74ff",
          soft: "#1a1633",
        },

        // Provenance: quiet when generated, yours when edited, held when pinned.
        generated: "#7e879e",
        edited: "#4ea1ff",
        pinned: "#ffb347",

        good: "#3ddc97",
        warn: "#ffb347",
        bad: "#ff5c7c",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // Display sizes are set tight and light: they are numbers to be read
        // at a glance, not headings to be scanned.
        "display-sm": ["2.5rem", { lineHeight: "1", letterSpacing: "-0.03em" }],
        display: ["3.75rem", { lineHeight: "0.95", letterSpacing: "-0.04em" }],
        "display-lg": ["5.5rem", { lineHeight: "0.9", letterSpacing: "-0.045em" }],
      },
      boxShadow: {
        raise: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.8)",
        float:
          "0 4px 12px rgba(0,0,0,0.5), 0 24px 64px -24px rgba(0,0,0,0.9)",
        glow: "0 0 0 1px rgba(124,92,255,0.3), 0 8px 32px -8px rgba(124,92,255,0.4)",
      },
      transitionTimingFunction: {
        // Slight overshoot: things arrive rather than merely appearing.
        spring: "cubic-bezier(0.22, 1.4, 0.36, 1)",
        exit: "cubic-bezier(0.4, 0, 1, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-line": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        // Sweeps a highlight across a surface that is still loading.
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 320ms cubic-bezier(0.22, 1.4, 0.36, 1) both",
        "fade-in": "fade-in 200ms ease-out both",
        "scale-in": "scale-in 180ms cubic-bezier(0.22, 1.4, 0.36, 1) both",
        "pulse-line": "pulse-line 1.6s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
