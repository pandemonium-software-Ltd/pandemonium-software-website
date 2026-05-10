// Brand-colour utilities — derive a Tailwind-style 50-900 tonal
// scale from a single hex input, plus pick an accessible text
// colour for use ON that accent.
//
// Pure functions, no I/O. Used by templates to render CSS custom
// properties for the customer's primary + secondary brand colours.
//
// Algorithm: convert hex → HSL, then mix toward white (for the
// 50-400 range) and toward black (for the 600-900 range), keeping
// hue stable. The 500 step is the input value unchanged.
//
// Not perfect colour theory — Tailwind's own palettes use bespoke
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
  /** Best foreground (black or near-white) for text ON the 500
   *  shade — meets WCAG AA (4.5:1) for body text. */
  textOn500: "#ffffff" | "#0a1422";
};

/**
 * Generate a Tailwind-style 50-900 tonal scale from a single hex
 * input. The 500 step IS the input.
 */
export function generateTonalScale(hex: HexColor): TonalScale {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);

  // Mix-toward-white ratios for 50→400 (lighter), and mix-toward-
  // black for 600→900 (darker). Calibrated to roughly match
  // Tailwind's perceptual spacing on the navy palette.
  const lightSteps = [0.95, 0.85, 0.7, 0.5, 0.25] as const; // 50, 100, 200, 300, 400
  const darkSteps = [0.15, 0.3, 0.5, 0.7] as const; // 600, 700, 800, 900

  const scale: Record<string, string> = {};
  lightSteps.forEach((mixToWhite, i) => {
    const stepKey = String([50, 100, 200, 300, 400][i]);
    scale[stepKey] = rgbToHex(mixWithWhite(rgb, mixToWhite));
  });
  scale["500"] = hex;
  darkSteps.forEach((mixToBlack, i) => {
    const stepKey = String([600, 700, 800, 900][i]);
    scale[stepKey] = rgbToHex(mixWithBlack(rgb, mixToBlack));
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

/**
 * Pick black or white for text ON a coloured background to maximise
 * contrast. Uses WCAG relative luminance — same formula browsers use.
 *
 * Returns near-black (#0a1422 — same as our navy-950) for light
 * backgrounds, white for dark. The hex 500-shade input is what's
 * being used as the background.
 */
export function pickAccessibleText(rgb: {
  r: number;
  g: number;
  b: number;
}): "#ffffff" | "#0a1422" {
  // Relative luminance per WCAG 2.x.
  const channelLum = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum =
    0.2126 * channelLum(rgb.r) +
    0.7152 * channelLum(rgb.g) +
    0.0722 * channelLum(rgb.b);
  // Threshold ~0.5 puts most "mid" colours on the right side. For
  // exact perceptual midpoint use ~0.179, but 0.5 is more forgiving
  // and matches what most design systems do in practice.
  return lum > 0.5 ? "#0a1422" : "#ffffff";
}

/**
 * Render a CSS block declaring custom properties for both brand
 * colours' tonal scales. Templates inject this into their CSS so
 * `var(--brand-primary-500)` etc. resolve to the customer's colours.
 */
export function renderColorVariables(args: {
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
}
`;
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

function rgbToHsl(rgb: { r: number; g: number; b: number }): {
  h: number;
  s: number;
  l: number;
} {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
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
