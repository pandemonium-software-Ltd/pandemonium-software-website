import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep navy primary — trustworthy, professional
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
        // Warm orange accent — approachable, human
        ember: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },
        // Warm neutral for backgrounds
        cream: {
          50: "#fdfcf9",
          100: "#faf7f0",
          200: "#f4efe3",
          300: "#ebe3d0",
          400: "#ddd1b6",
          500: "#cbb995",
          600: "#b29a72",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
      },
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.25rem" }],
        sm: ["0.9375rem", { lineHeight: "1.5rem" }],
        base: ["1.0625rem", { lineHeight: "1.75rem" }],
        lg: ["1.1875rem", { lineHeight: "1.875rem" }],
        xl: ["1.3125rem", { lineHeight: "2rem" }],
        "2xl": ["1.625rem", { lineHeight: "2.25rem" }],
        "3xl": ["2rem", { lineHeight: "2.5rem" }],
        "4xl": ["2.5rem", { lineHeight: "3rem" }],
        "5xl": ["3.25rem", { lineHeight: "3.5rem" }],
        "6xl": ["4rem", { lineHeight: "4.25rem" }],
      },
      maxWidth: {
        prose: "65ch",
        content: "72rem",
      },
      boxShadow: {
        soft: "0 1px 3px 0 rgb(15 29 48 / 0.04), 0 4px 12px -2px rgb(15 29 48 / 0.06)",
        lift: "0 4px 6px -1px rgb(15 29 48 / 0.08), 0 10px 20px -4px rgb(15 29 48 / 0.1)",
        card: "0 1px 2px 0 rgb(15 29 48 / 0.04), 0 2px 8px 0 rgb(15 29 48 / 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
