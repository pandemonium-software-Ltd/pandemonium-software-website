// Newsletter brand helpers shared by the send + preview routes.
//
// Both routes need to derive the NewsletterBrand shape (logo,
// colours) from the prospect's onboardingData. Extracted here so
// the preview never drifts from what the live send actually
// renders — same source, same colours.

/** R2-public-URL the logo asset, if any. Returns undefined if no
 *  logo uploaded OR R2_PUBLIC_URL_BASE isn't configured. */
export function pickLogoUrl(
  ob: Record<string, unknown>,
): string | undefined {
  const assets = (ob.assets ?? {}) as {
    logo?: { key?: string };
  };
  const key = assets.logo?.key;
  if (!key) return undefined;
  const base = process.env.R2_PUBLIC_URL_BASE;
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/${key}`;
}

/** 6-digit hex colour from the prospect's branding slice. Falls
 *  back to a sensible default so newsletter renders even when the
 *  customer hasn't picked their palette yet — same defaults as
 *  customer-site-template/adapter.ts so the email looks like the
 *  site. */
export function pickBrandColor(
  ob: Record<string, unknown>,
  which: "primary" | "secondary",
): string {
  const branding = (ob.branding ?? {}) as {
    brandColorPrimary?: string;
    brandColorSecondary?: string;
  };
  const fromBranding =
    which === "primary"
      ? branding.brandColorPrimary
      : branding.brandColorSecondary;
  if (fromBranding && /^#[0-9a-fA-F]{6}$/.test(fromBranding))
    return fromBranding;
  return which === "primary" ? "#1e3a8a" : "#f97316";
}
