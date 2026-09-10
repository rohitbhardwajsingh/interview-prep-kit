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
  // Category colours are chosen at runtime from the question's category, so
  // the class names never appear literally for the scanner to find.
  safelist: [
    "text-technical",
    "text-behavioural",
    "text-system-design",
    "text-company-fit",
    "bg-technical",
    "bg-behavioural",
    "bg-system-design",
    "bg-company-fit",
    "border-technical",
    "border-behavioural",
    "border-system-design",
    "border-company-fit",
  ],
  theme: {
    extend: {
      colors: {
        // Stacked surfaces, darkest first. Lifted a touch from pure black so
        // cards read as objects with weight rather than holes.
        void: "#080a11",
        surface: {
          DEFAULT: "#11141f",
          raised: "#171b28",
          high: "#222738",
        },
        line: {
          DEFAULT: "#262c3d",
          strong: "#3a4257",
        },
        // Text, brightest first. dim and faint are deliberately brighter than
        // a typical dark theme: this app is read under stress, and low
        // contrast is the first thing that makes it feel hard.
        paper: "#f2f4fa",
        dim: "#c2c9db",
        faint: "#8b93ac",

        accent: {
          DEFAULT: "#8b5cff",
          hover: "#9d76ff",
          soft: "#211a3d",
        },
        // A second, cooler accent so the interface is not monochrome violet.
        // Used for calm/positive motion (progress, completion, evidence).
        cyan: {
          DEFAULT: "#22d3ee",
          soft: "#0c2830",
        },

        // Provenance: quiet when generated, yours when edited, held when pinned.
        generated: "#8b93ac",
        edited: "#4ea1ff",
        pinned: "#ffb347",

        good: "#34e0a1",
        warn: "#ffb347",
        bad: "#ff6b88",

        // Question categories, so the eye can sort a long list by colour
        // before reading a word of it.
        technical: "#4ea1ff",
        behavioural: "#8b5cff",
        "system-design": "#ffb347",
        "company-fit": "#34e0a1",
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
        glow: "0 0 0 1px rgba(139,92,255,0.35), 0 10px 40px -10px rgba(139,92,255,0.5)",
        "glow-cyan": "0 0 0 1px rgba(34,211,238,0.3), 0 10px 40px -12px rgba(34,211,238,0.4)",
      },
      backgroundImage: {
        "accent-grad": "linear-gradient(135deg, #8b5cff 0%, #6d3cff 100%)",
        "hero-grad":
          "radial-gradient(130% 100% at 0% 0%, rgba(139,92,255,0.22) 0%, transparent 55%), radial-gradient(120% 100% at 100% 0%, rgba(34,211,238,0.12) 0%, transparent 50%)",
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
