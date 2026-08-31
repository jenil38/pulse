import type { Config } from "tailwindcss";

/**
 * PULSE design tokens.
 *
 * Identity: near-black / graphite base, mineral cyan for healthy data flow,
 * muted amber for degraded, restrained red for failure, neutral greys for type.
 * No purple AI gradients, no cyberpunk neon, no heavy glassmorphism.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // --- base: layered graphite -------------------------------------
        void: "#060708",
        base: "#0A0C0D",
        panel: "#0F1214",
        raised: "#151A1D",
        line: "#1E2529",
        "line-strong": "#2A3237",

        // --- typography: soft neutral whites / greys ---------------------
        ink: "#E6EAEC",
        "ink-dim": "#9AA4AB",
        "ink-mute": "#646E75",
        "ink-faint": "#3D464C",

        // --- state language ----------------------------------------------
        healthy: {
          DEFAULT: "#3FC8BC", // mineral cyan / teal
          dim: "#2A8A82",
          faint: "#12332F",
        },
        degraded: {
          DEFAULT: "#C8933F", // muted amber
          dim: "#8A6529",
          faint: "#2E2413",
        },
        failed: {
          DEFAULT: "#C85A4E", // restrained red
          dim: "#8A3E36",
          faint: "#2E1815",
        },
        stale: {
          DEFAULT: "#7E8A93", // neutral drift
          dim: "#59636A",
          faint: "#1E2429",
        },
        recovering: {
          DEFAULT: "#5FA8C8", // cool transitional blue
          dim: "#3E7189",
          faint: "#15272E",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        micro: ["0.625rem", { lineHeight: "0.875rem", letterSpacing: "0.14em" }],
        meta: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.1em" }],
      },
      transitionTimingFunction: {
        // Weighted, damped motion — no bounce.
        pulse: "cubic-bezier(0.22, 1, 0.36, 1)",
        "pulse-in": "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      animation: {
        "flow-pulse": "flowPulse 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
        "fade-up": "fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) both",
        drift: "drift 3.2s ease-in-out infinite",
      },
      keyframes: {
        flowPulse: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        drift: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "0.85" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
