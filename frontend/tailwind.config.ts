import type { Config } from "tailwindcss";

/**
 * PULSE design system.
 *
 * All colours resolve to CSS variables (see globals.css) so the entire
 * environment can switch between `normal` and `chaos` mode via one attribute
 * on <html>, while keeping Tailwind's opacity modifiers working.
 *
 * Discipline enforced here:
 *   - 4-step surface and text scales, nothing arbitrary
 *   - one radius ladder, default 8px, nothing above 16px
 *   - weight 510 for emphasis (never 700)
 *   - a small type scale with one workhorse size (14px)
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        subtle: v("subtle"),
        muted: v("muted"),
        stage: v("stage"),

        "border-subtle": v("border-subtle"),
        border: v("border"),
        "border-strong": v("border-strong"),

        primary: v("text-primary"),
        secondary: v("text-secondary"),
        tertiary: v("text-tertiary"),
        quaternary: v("text-quaternary"),

        accent: {
          DEFAULT: v("accent"),
          hover: v("accent-hover"),
          active: v("accent-active"),
          subtle: v("accent-subtle"),
          border: v("accent-border"),
          text: v("accent-text"),
          fg: v("on-accent"),
        },

        healthy: {
          DEFAULT: v("healthy"),
          border: v("healthy-border"),
          bg: v("healthy-bg"),
        },
        degraded: {
          DEFAULT: v("degraded"),
          border: v("degraded-border"),
          bg: v("degraded-bg"),
        },
        failed: {
          DEFAULT: v("failed"),
          border: v("failed-border"),
          bg: v("failed-bg"),
        },
        recovering: {
          DEFAULT: v("recovering"),
          border: v("recovering-border"),
          bg: v("recovering-bg"),
        },
        stale: {
          DEFAULT: v("stale"),
          border: v("stale-border"),
          bg: v("stale-bg"),
        },
      },

      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        // Reserved for IDs, metrics, timestamps, schema versions, shortcuts.
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },

      fontSize: {
        "display-xl": ["3.75rem", { lineHeight: "1", letterSpacing: "-0.03em", fontWeight: "500" }],
        display: ["2.5rem", { lineHeight: "1.05", letterSpacing: "-0.025em", fontWeight: "500" }],
        "title-lg": ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "510" }],
        title: ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.015em", fontWeight: "510" }],
        heading: ["1rem", { lineHeight: "1.4", letterSpacing: "-0.01em", fontWeight: "510" }],
        body: ["0.875rem", { lineHeight: "1.5" }],
        small: ["0.8125rem", { lineHeight: "1.45" }],
        caption: ["0.75rem", { lineHeight: "1.35" }],
        micro: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.02em", fontWeight: "510" }],
        mono: ["0.75rem", { lineHeight: "1.4" }],
      },

      fontWeight: {
        normal: "400",
        // Emphasis without shouting — the Linear detail worth stealing.
        medium: "510",
        semibold: "600",
      },

      borderRadius: {
        xs: "4px",
        sm: "6px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },

      boxShadow: {
        raised: "var(--shadow-raised)",
        card: "var(--shadow-card)",
        overlay: "var(--shadow-overlay)",
        none: "none",
      },

      spacing: {
        // 4px base rhythm; control heights as named steps.
        "control-xs": "24px",
        "control-sm": "28px",
        control: "32px",
        "control-lg": "36px",
      },

      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        exit: "cubic-bezier(0.4, 0, 1, 1)",
      },

      transitionDuration: {
        instant: "100ms",
        fast: "150ms",
        base: "200ms",
        slow: "300ms",
        mode: "600ms",
      },

      animation: {
        "fade-in": "fadeIn 150ms cubic-bezier(0.2,0,0,1) both",
        "slide-up": "slideUp 200ms cubic-bezier(0.2,0,0,1) both",
        "scale-in": "scaleIn 150ms cubic-bezier(0.2,0,0,1) both",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.98)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
