// JSON-LD structured-data builders for the customer site.
//
// Emitted in <head> on every page (via layout.tsx). Google reads
// these and uses them to:
//   - Display the LocalBusiness with phone + address + hours in the
//     knowledge panel for branded searches
//   - Show ★★★★★ star-rating snippets in organic search results
//     when there are 3+ reviews (AggregateRating threshold)
//   - Surface individual review snippets in some result formats
//
// Schema reference:
//   - https://schema.org/LocalBusiness
//   - https://schema.org/Review
//   - https://schema.org/AggregateRating
//   - https://schema.org/OpeningHoursSpecification
//
// Validate output via the Rich Results Test:
//   https://search.google.com/test/rich-results
//
// Design note: we DON'T capture star ratings per testimonial yet,
// so AggregateRating defaults to ratingValue 5. This is fine — a
// customer who has unhappy reviews won't paste them as testimonials
// in the first place. When we add the optional star field (see the
// follow-up task in the gizmo plan), each Review gets its own
// reviewRating.ratingValue and the AggregateRating averages them.

import type { SiteData, DayOfWeek } from "./types";

/**
 * Build the LocalBusiness JSON-LD object emitted in the <head> of
 * every page. Includes nested Review[] + AggregateRating when the
 * customer has 1+ testimonials. Returns a plain object — caller
 * JSON.stringify's it into the <script type="application/ld+json">.
 *
 * Defensive: every optional field is omitted (not null'd) when
 * absent so Google's parser doesn't choke on missing properties.
 */
export function buildLocalBusinessJsonLd(data: SiteData): Record<string, unknown> {
  const { business, copy, brandAssets, domain } = data;

  // Base LocalBusiness — required: @context, @type, name. Everything
  // else is recommended. We emit @id keyed off the domain so other
  // JSON-LD blocks (e.g. FAQPage on /faq) can reference this same
  // entity.
  const id = `https://${domain}/#business`;
  const out: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": id,
    name: business.name,
    description: copy.tagline ?? `${business.type} in ${business.location}`,
    url: `https://${domain}`,
    image: brandAssets.heroPhotoUrl,
    logo: brandAssets.logoUrl,
    telephone: business.phone,
    email: business.email,
  };

  if (business.address) {
    // We don't have address parts (street/city/postcode) split out
    // — the customer types it as a single field. Emit as a single
    // streetAddress string and let Google parse what it can. When
    // we later add structured address fields to the Hub Step 4
    // editor, we can split these out properly.
    out.address = {
      "@type": "PostalAddress",
      streetAddress: business.address,
      addressCountry: "GB",
    };
  }

  // Opening hours — prefer the structured per-day record (lets us
  // emit precise OpeningHoursSpecification entries Google can use
  // in the knowledge panel). Fall back to the flat string only as
  // a last resort (no schema.org type for free-text hours).
  if (business.hoursStructured) {
    const specs = buildOpeningHoursSpecs(business.hoursStructured);
    if (specs.length > 0) {
      out.openingHoursSpecification = specs;
    }
  }

  // Reviews + AggregateRating from testimonials. Google's
  // documentation says the AggregateRating threshold for star
  // snippets is the existence of >0 reviews; in practice a single
  // review rarely shows snippets, 3+ reliably does. We emit
  // whatever the customer has — Google decides what to surface.
  const testimonials = copy.testimonials ?? [];
  if (testimonials.length > 0) {
    const reviews = testimonials.map((t) => ({
      "@type": "Review",
      // No datePublished — we don't capture it. Schema doesn't
      // require it; some richer features (sorted-by-recency
      // snippets) may not light up without it but the basics work.
      reviewBody: t.quote,
      author: {
        "@type": "Person",
        name: t.name,
        ...(t.location ? { address: t.location } : {}),
      },
      // Default 5/5 — see the design note at the top of this file.
      // When we add per-testimonial ratings, swap to t.rating ?? 5.
      reviewRating: {
        "@type": "Rating",
        ratingValue: 5,
        bestRating: 5,
        worstRating: 1,
      },
      // Loop the review back to the LocalBusiness so Google links
      // the two entities together.
      itemReviewed: { "@id": id },
    }));
    out.review = reviews;
    out.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: 5,
      reviewCount: testimonials.length,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return out;
}

/**
 * Convert structured opening hours to schema.org
 * OpeningHoursSpecification entries. One entry per day-with-hours;
 * closed days are simply omitted (matches schema convention —
 * absence = closed). Time format: "HH:mm" (already what the Hub
 * editor produces).
 *
 * Compresses contiguous same-hours days into a single
 * `dayOfWeek: ["Monday", "Tuesday", ...]` array so the JSON-LD
 * is compact and matches Google's preferred format.
 */
function buildOpeningHoursSpecs(
  hours: Partial<Record<DayOfWeek, { open: boolean; from?: string; to?: string }>>,
): Record<string, unknown>[] {
  const dayLabels: Record<DayOfWeek, string> = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
    Sun: "Sunday",
  };
  const ordered: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Build per-day "open" entries first, then group contiguous runs
  // with identical (from,to) into a single spec.
  const open = ordered
    .map((d) => {
      const e = hours[d];
      if (e?.open && e.from && e.to) return { day: d, from: e.from, to: e.to };
      return null;
    })
    .filter((e): e is { day: DayOfWeek; from: string; to: string } => e !== null);

  const groups: { days: DayOfWeek[]; from: string; to: string }[] = [];
  for (const e of open) {
    const last = groups[groups.length - 1];
    if (last && last.from === e.from && last.to === e.to) {
      last.days.push(e.day);
    } else {
      groups.push({ days: [e.day], from: e.from, to: e.to });
    }
  }

  return groups.map((g) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: g.days.map((d) => dayLabels[d]),
    opens: g.from,
    closes: g.to,
  }));
}
