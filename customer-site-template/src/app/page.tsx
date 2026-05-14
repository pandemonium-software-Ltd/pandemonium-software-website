// Home page — the four structures (services / showcase / booking /
// editorial) now switch BOTH the hero (HomeHero) and the body
// (HomeBody). Page.tsx is just an orchestration shell:
//
//   1. OfferStrip  (when an active promo offer is configured)
//   2. HomeHero    (per-structure hero variant — Tier 2)
//   3. HomeBody    (per-structure body sections — Tier 3)
//
// All structure-specific decisions about gallery placement, services
// layout, testimonial treatment, CTA placement, and ordering live
// inside HomeBody — page.tsx no longer needs to know them.

import { SITE_DATA } from "@/lib/site-data";
import OfferStrip from "@/components/OfferStrip";
import HomeHero from "@/components/HomeHero";
import HomeBody from "@/components/HomeBody";

export default function HomePage() {
  const { modules } = SITE_DATA;
  const offer = modules.offer;

  return (
    <>
      {offer && (
        <OfferStrip
          headline={offer.headline}
          body={offer.body}
          ctaLabel={offer.ctaLabel}
          ctaUrl={offer.ctaUrl}
          startsAt={offer.startsAt}
          endsAt={offer.endsAt}
        />
      )}
      <HomeHero data={SITE_DATA} />
      <HomeBody data={SITE_DATA} />
    </>
  );
}
