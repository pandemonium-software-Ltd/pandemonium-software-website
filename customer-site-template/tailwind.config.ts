import type { Config } from "tailwindcss";

// Customer-site Tailwind config. Mirrors the marketing site's
// design system (navy / ember / cream palette + Geist fonts) but
// also exposes per-customer brand colour custom properties as
// proper Tailwind utilities (`bg-brand-primary-500`,
// `text-brand-secondary-600`, etc.).
//
// The custom-property values themselves are injected at request
// time by the layout's <style> block — they're populated from the
// customer's Phase 3 intake (brandColorPrimary + brandColorSecondary)
// via the colour-scale generator in src/lib/site-generator/colors.ts.

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Marketing-site palette as the BASE — used for neutrals,
        // backgrounds, body text. These don't change per customer.
        navy: {
          50: "#f0f4f9",
          100: "#dae3ef",
          200: "#b4c6dd",
          300: "#8ba5c6",
          400: "#5d82ab",
          500: "#3d6591",
          600: "#2c4d74",
          700: "#223b5b",
          800: "#172a42",
          900: "#0f1d30",
          950: "#0a1422",
        },
        cream: {
          50: "#fdfcf9",
          100: "#faf7f0",
          200: "#f4efe3",
          300: "#ebe3d0",
          400: "#ddd1b6",
          500: "#cbb995",
          600: "#b29a72",
        },
        // Per-customer brand colours — values come from CSS custom
        // properties set by the customer-data-driven <style> block
        // in layout.tsx. Tailwind classes like `bg-brand-primary-500`
        // resolve to var(--brand-primary-500), which itself resolves
        // to the customer's chosen hex (or its derived tonal scale).
        "brand-primary": {
          50: "var(--brand-primary-50)",
          100: "var(--brand-primary-100)",
          200: "var(--brand-primary-200)",
          300: "var(--brand-primary-300)",
          400: "var(--brand-primary-400)",
          500: "var(--brand-primary-500)",
          600: "var(--brand-primary-600)",
          700: "var(--brand-primary-700)",
          800: "var(--brand-primary-800)",
          900: "var(--brand-primary-900)",
          // Auto-picked text colour for use ON brand-primary-500.
          text: "var(--brand-primary-text)",
        },
        "brand-secondary": {
          50: "var(--brand-secondary-50)",
          100: "var(--brand-secondary-100)",
          200: "var(--brand-secondary-200)",
          300: "var(--brand-secondary-300)",
          400: "var(--brand-secondary-400)",
          500: "var(--brand-secondary-500)",
          600: "var(--brand-secondary-600)",
          700: "var(--brand-secondary-700)",
          800: "var(--brand-secondary-800)",
          900: "var(--brand-secondary-900)",
          text: "var(--brand-secondary-text)",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "Menlo",
          "monospace",
        ],
      },
      maxWidth: {
        content: "72rem",
      },
      boxShadow: {
        card: "0 4px 16px -4px rgba(10, 20, 34, 0.08)",
        lift: "0 18px 40px -16px rgba(10, 20, 34, 0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
