// Brand-colour utilities — derive a Tailwind-style 50-900 tonal
// scale from a single hex input, plus pick an accessible text
// colour for use ON that accent.
//
// Mirror of `src/lib/site-generator/colors.ts` in the marketing-site
// repo. Kept here so the customer-site template doesn't depend on
// the marketing-site repo at build time.
//
// Algorithm: convert hex → mix toward white (50-400) or black
// (600-900) at calibrated ratios. The 500 step IS the input. Not
// perfect colour theory — Tailwind's own palettes use bespoke
// curves per family — but good enough for a per-customer accent
// where Ben's not designing each shade by hand.

import type { HexColor } from "./types";

export type TonalScale = {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  textOn500: "#ffffff" | "#0a1422";
};

export function generateTonalScale(hex: HexColor): TonalScale {
  const rgb = hexToRgb(hex);

  const lightSteps = [0.95, 0.85, 0.7, 0.5, 0.25] as const; // 50, 100, 200, 300, 400
  const darkSteps = [0.15, 0.3, 0.5, 0.7] as const; // 600, 700, 800, 900

  const scale: Record<string, string> = { "500": hex };
  lightSteps.forEach((mix, i) => {
    scale[String([50, 100, 200, 300, 400][i])] = rgbToHex(
      mixWithWhite(rgb, mix),
    );
  });
  darkSteps.forEach((mix, i) => {
    scale[String([600, 700, 800, 900][i])] = rgbToHex(
      mixWithBlack(rgb, mix),
    );
  });

  return {
    50: scale["50"],
    100: scale["100"],
    200: scale["200"],
    300: scale["300"],
    400: scale["400"],
    500: scale["500"],
    600: scale["600"],
    700: scale["700"],
    800: scale["800"],
    900: scale["900"],
    textOn500: pickAccessibleText(rgb),
  };
}

export function pickAccessibleText(rgb: {
  r: number;
  g: number;
  b: number;
}): "#ffffff" | "#0a1422" {
  const channelLum = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum =
    0.2126 * channelLum(rgb.r) +
    0.7152 * channelLum(rgb.g) +
    0.0722 * channelLum(rgb.b);
  return lum > 0.5 ? "#0a1422" : "#ffffff";
}

/**
 * Render the inline <style> block that exposes both brand colours'
 * tonal scales as CSS custom properties. Goes in the <head> of the
 * layout so it's available to every page + every Tailwind utility
 * defined in tailwind.config.ts.
 */
export function brandColorsStyleBlock(args: {
  primary: HexColor;
  secondary: HexColor;
}): string {
  const p = generateTonalScale(args.primary);
  const s = generateTonalScale(args.secondary);
  return `:root {
  --brand-primary-50: ${p[50]};
  --brand-primary-100: ${p[100]};
  --brand-primary-200: ${p[200]};
  --brand-primary-300: ${p[300]};
  --brand-primary-400: ${p[400]};
  --brand-primary-500: ${p[500]};
  --brand-primary-600: ${p[600]};
  --brand-primary-700: ${p[700]};
  --brand-primary-800: ${p[800]};
  --brand-primary-900: ${p[900]};
  --brand-primary-text: ${p.textOn500};
  --brand-secondary-50: ${s[50]};
  --brand-secondary-100: ${s[100]};
  --brand-secondary-200: ${s[200]};
  --brand-secondary-300: ${s[300]};
  --brand-secondary-400: ${s[400]};
  --brand-secondary-500: ${s[500]};
  --brand-secondary-600: ${s[600]};
  --brand-secondary-700: ${s[700]};
  --brand-secondary-800: ${s[800]};
  --brand-secondary-900: ${s[900]};
  --brand-secondary-text: ${s.textOn500};
}`;
}

// ---------- Internals ----------

function hexToRgb(hex: HexColor): { r: number; g: number; b: number } {
  const cleaned = hex.replace("#", "");
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function mixWithWhite(
  rgb: { r: number; g: number; b: number },
  ratio: number,
): { r: number; g: number; b: number } {
  return {
    r: rgb.r + (255 - rgb.r) * ratio,
    g: rgb.g + (255 - rgb.g) * ratio,
    b: rgb.b + (255 - rgb.b) * ratio,
  };
}

function mixWithBlack(
  rgb: { r: number; g: number; b: number },
  ratio: number,
): { r: number; g: number; b: number } {
  return {
    r: rgb.r * (1 - ratio),
    g: rgb.g * (1 - ratio),
    b: rgb.b * (1 - ratio),
  };
}
