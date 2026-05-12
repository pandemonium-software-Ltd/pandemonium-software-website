// Orchestrator: walks the SiteGeneratorInput, decides which fields
// are worth polishing, applies the cache, and returns an enriched
// version + the (possibly mutated) cache for the caller to persist.
//
// Why a separate orchestrator: keeps the polish prompts pure (one
// input → one output) and centralises the "what gets polished"
// policy in one place. If we want to add a new polish target later
// (e.g. servicesIntro), it's a single new block here.
//
// Concurrency: all polish calls fan out in parallel (Promise.all).
// The marketing-site Worker handles requests with plenty of CPU
// headroom; build paths are <1 req/min so this won't trip rate
// limits. If we ever hit Anthropic's RPM cap we'd batch — but
// at our scale we won't.
//
// Failure semantics: enrichment never throws. Each polish call
// individually returns null on failure, which means "use raw input".
// The build always succeeds, just with the rawer copy.

import type {
  CustomCopy,
  Service,
  SiteGeneratorInput,
} from "../site-generator/types";
import type { CopySources } from "../site-generator/adapter";
import { HAIKU_MODEL } from "./client";
import { cacheKey, readCache, writeCache, type HaikuCache } from "./cache";
import {
  polishAboutBlurb,
  polishFaqAnswer,
  polishServiceDescription,
} from "./polish";

/**
 * Enrich a SiteGeneratorInput with Haiku-polished copy. Reads from
 * the existing cache (cheap), only calls Haiku for fields not yet
 * cached or whose raw input has changed (hash mismatch → new key).
 *
 * Source gating: polish ONLY fires on `intake`-sourced text (Phase 3
 * raw dump where customers write awkwardly). `content`-sourced text
 * — Hub Step 4 customer edits or change-request patches — passes
 * through verbatim. Customer intent must be respected once they've
 * touched the copy directly. The tagline polish was dropped entirely
 * (customers always want hero taglines word-for-word).
 *
 * Returns:
 *   - enriched: the new SiteGeneratorInput with polished copy in place
 *   - cache: the (possibly mutated) cache; caller must persist it via
 *            writeHaikuCache if `cacheChanged === true`
 *   - cacheChanged: true if any new polish entries were written —
 *            saves a Notion round-trip on cache-only-hits.
 */
export async function enrichWithHaiku(
  input: SiteGeneratorInput,
  initialCache: HaikuCache | undefined,
  copySources: CopySources,
): Promise<{
  enriched: SiteGeneratorInput;
  cache: HaikuCache;
  cacheChanged: boolean;
}> {
  const cache: HaikuCache = { ...(initialCache ?? {}) };
  let changed = false;

  const ctx = {
    businessName: input.business.name,
    businessType: input.business.type,
    location: input.business.location || undefined,
  };

  // Plan all polish jobs as cache-aware promises. Each resolves to
  // { kind, key, polished } or null (no work needed).
  //
  // Tagline polish was REMOVED — customer-written taglines are short
  // and intentional. The cost of silently rewriting them outweighs
  // any "polish" benefit. Verbatim every time.
  type Job = {
    target: "about" | "service" | "faq";
    index: number; // for service/faq mapping back
    key: string;
    polished: string | null;
    fromCache: boolean;
  };

  const jobs: Promise<Job | null>[] = [];

  // --- About blurb (intake-sourced only) ---
  // Polishing the Phase 3 dump adds value (long unstructured text);
  // polishing Hub Step 4 edits silently overrides the customer.
  if (input.copy.aboutBlurb && copySources.aboutBlurb === "intake") {
    const raw = input.copy.aboutBlurb;
    jobs.push(
      (async () => {
        const key = await cacheKey("about-blurb", raw);
        const cached = readCache(cache, key);
        if (cached !== null) {
          return { target: "about", index: 0, key, polished: cached, fromCache: true };
        }
        const polished = await polishAboutBlurb(raw, ctx);
        return { target: "about", index: 0, key, polished, fromCache: false };
      })(),
    );
  }

  // --- Service long descriptions (intake-sourced only) ---
  // Today longDescription only ever comes from content (no intake
  // fallback wired in adapter), so this branch never fires. Left in
  // place behind the source gate for forward-compat if a future
  // intake schema starts emitting longDescription.
  input.services.forEach((svc, i) => {
    if (!svc.longDescription) return;
    if (copySources.serviceLongDescriptions?.[i] !== "intake") return;
    const raw = svc.longDescription;
    jobs.push(
      (async () => {
        // Service descriptions key on (kind, name, raw) so renaming a
        // service doesn't hit cache for a different service's text.
        const key = await cacheKey(`service-desc:${svc.name}`, raw);
        const cached = readCache(cache, key);
        if (cached !== null) {
          return { target: "service", index: i, key, polished: cached, fromCache: true };
        }
        const polished = await polishServiceDescription(raw, svc.name, ctx);
        return { target: "service", index: i, key, polished, fromCache: false };
      })(),
    );
  });

  // --- FAQ answers (intake-sourced only) ---
  // FAQ entries only live in Hub Step 4 Content today, so this
  // branch never fires. Same forward-compat reasoning as services.
  (input.copy.faq ?? []).forEach((entry, i) => {
    if (!entry.answer) return;
    if (copySources.faqAnswers?.[i] !== "intake") return;
    const raw = entry.answer;
    jobs.push(
      (async () => {
        const key = await cacheKey(`faq-answer:${entry.question}`, raw);
        const cached = readCache(cache, key);
        if (cached !== null) {
          return { target: "faq", index: i, key, polished: cached, fromCache: true };
        }
        const polished = await polishFaqAnswer(raw, entry.question, ctx);
        return { target: "faq", index: i, key, polished, fromCache: false };
      })(),
    );
  });

  const results = await Promise.all(jobs);

  // Apply results back to the input. We rebuild copy + services
  // immutably so the original input remains untouched (callers may
  // log it for debugging). Tagline is no longer polished — passes
  // through unchanged from input.
  let newAboutBlurb = input.copy.aboutBlurb;
  const newServices: Service[] = input.services.map((s) => ({ ...s }));
  const newFaq = (input.copy.faq ?? []).map((e) => ({ ...e }));

  for (const r of results) {
    if (!r) continue;
    if (!r.fromCache && r.polished !== null) {
      writeCache(cache, r.key, r.polished, HAIKU_MODEL);
      changed = true;
    }
    if (r.polished === null) continue;
    switch (r.target) {
      case "about":
        newAboutBlurb = r.polished;
        break;
      case "service":
        newServices[r.index] = {
          ...newServices[r.index]!,
          longDescription: r.polished,
        };
        break;
      case "faq":
        newFaq[r.index] = {
          ...newFaq[r.index]!,
          answer: r.polished,
        };
        break;
    }
  }

  const enrichedCopy: CustomCopy = {
    ...input.copy,
    aboutBlurb: newAboutBlurb,
    faq: newFaq.length > 0 ? newFaq : input.copy.faq,
  };

  const enriched: SiteGeneratorInput = {
    ...input,
    services: newServices,
    copy: enrichedCopy,
  };

  return { enriched, cache, cacheChanged: changed };
}
