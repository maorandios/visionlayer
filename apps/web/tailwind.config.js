/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "var(--color-canvas)",
          elevated: "var(--color-canvas-elevated)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          elevated: "var(--color-surface-elevated)",
        },
        muted: "var(--color-muted)",
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          muted: "var(--color-ink-muted)",
          faint: "var(--color-ink-faint)",
          "on-accent": "var(--color-ink-on-accent)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          soft: "var(--color-accent-soft)",
          strong: "var(--color-accent-strong)",
          hover: "var(--color-accent-hover)",
        },
        overlay: {
          DEFAULT: "var(--color-overlay)",
          strong: "var(--color-overlay-strong)",
        },
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: {
          DEFAULT: "var(--color-danger)",
          soft: "var(--color-danger-soft)",
        },
      },
      fontFamily: {
        sans: [
          "Google Sans",
          "var(--font-heebo)",
          "Assistant",
          "Segoe UI",
          "Tahoma",
          "sans-serif",
        ],
        product: [
          "Google Sans",
          "var(--font-heebo)",
          "Assistant",
          "Segoe UI",
          "Tahoma",
          "sans-serif",
        ],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-xl)",
      },
      boxShadow: {
        float: "var(--shadow-float)",
        soft: "var(--shadow-soft)",
      },
      backdropBlur: {
        glass: "var(--blur-md)",
      },
    },
  },
  plugins: [],
};
