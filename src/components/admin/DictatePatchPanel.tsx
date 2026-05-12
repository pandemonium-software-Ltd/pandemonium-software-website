"use client";

// "Dictate a patch" panel — shown inside ReviewEditEditor for edits
// Cowork escalated (out_of_scope / ambiguous / mixed scope) so the
// operator can force-apply a structured patch through the same
// applier the cron uses.
//
// Operator picks a target from the whitelist, types a new value,
// optionally supplies a locator for service/faq/testimonial
// targets, hits Apply. The endpoint runs validation + applies +
// dispatches build.
//
// Multiple patches per submission: same UI lets you stack up
// changes ("update phone AND opening hours") with one Apply click.

import { useState } from "react";

// Single source of truth for the dropdown — kept in sync with
// `SAFE_PATCH_TARGETS` in src/lib/haiku/classify-change-request.ts.
// Grouped + labelled for the UI; each entry encodes what kind of
// value to ask for AND whether a locator is needed.
type TargetSpec = {
  target: string;
  label: string;
  group: string;
  /** UI placeholder describing the expected newValue format. */
  hint: string;
  /** Which locator field (if any) is required. */
  locator?: "serviceName" | "faqQuestion" | "testimonialName";
};

const TARGET_SPECS: TargetSpec[] = [
  // Copy
  { group: "Copy", target: "copy.tagline", label: "Tagline", hint: "Plain text, ≤ 200 chars" },
  { group: "Copy", target: "copy.aboutBlurb", label: "About blurb", hint: "Plain text, multi-paragraph OK" },
  { group: "Copy", target: "content.aboutBullets", label: "About bullets (full replace)", hint: `JSON array of strings, e.g. ["Free quotes","Local team"]` },
  { group: "Copy", target: "content.aboutBullets.add", label: "About bullets — ADD one", hint: "Plain text — the new bullet" },
  { group: "Copy", target: "content.aboutBullets.remove", label: "About bullets — REMOVE one", hint: "Exact text of the bullet to remove" },
  // Business
  { group: "Business", target: "business.contactName", label: "Contact name", hint: "Plain text" },
  { group: "Business", target: "business.phoneDisplay", label: "Phone (display)", hint: 'e.g. "07824 369011"' },
  { group: "Business", target: "business.phoneTel", label: "Phone (tel:)", hint: 'Raw digits e.g. "07824369011"' },
  { group: "Business", target: "business.publicEmail", label: "Public email", hint: "valid@email.com" },
  { group: "Business", target: "business.address", label: "Address", hint: "Plain text" },
  { group: "Business", target: "business.serviceArea", label: "Service area", hint: "Plain text" },
  { group: "Business", target: "business.openingHours", label: "Opening hours (full week)", hint: `JSON object: {"Mon":{"open":true,"from":"09:00","to":"17:00"}, "Sat":{"open":false}, ...}` },
  // Trust
  { group: "Trust", target: "content.trust.yearsExperience", label: "Years experience", hint: "Integer, e.g. 12" },
  { group: "Trust", target: "content.trust.associations", label: "Associations", hint: 'e.g. "Member of FMB, Trustmark certified"' },
  { group: "Trust", target: "content.trust.awards", label: "Awards", hint: 'e.g. "Gardener of the Year 2024"' },
  // Branding
  { group: "Branding", target: "branding.brandColorPrimary", label: "Primary colour", hint: "6-digit hex e.g. #2c5e9f" },
  { group: "Branding", target: "branding.brandColorSecondary", label: "Secondary colour", hint: "6-digit hex e.g. #f3a536" },
  // Offers — whole-current-offer replace
  { group: "Branding", target: "content.offers.current", label: "Offers — replace current", hint: `JSON: {"id":"uuid","headline":"…","startsAt":"YYYY-MM-DD","endsAt":"YYYY-MM-DD","ctaLabel":"…","ctaUrl":"/contact"}` },
  // Services (locator for updates + remove)
  { group: "Services", target: "content.services.description", label: "Service: short description", hint: "Plain text", locator: "serviceName" },
  { group: "Services", target: "content.services.longDescription", label: "Service: long description", hint: "Plain text", locator: "serviceName" },
  { group: "Services", target: "content.services.pricingNotes", label: "Service: pricing notes", hint: 'e.g. "From £30/visit"', locator: "serviceName" },
  { group: "Services", target: "content.services.priceFrom", label: "Service: price from (£)", hint: "Number, e.g. 15000", locator: "serviceName" },
  { group: "Services", target: "content.services.features", label: "Service: features", hint: `JSON array e.g. ["Weekly visits","Moss treatment"]`, locator: "serviceName" },
  { group: "Services", target: "content.services.add", label: "ADD a new service", hint: `JSON: {"serviceName":"Tree Felling","priceFrom":200,"description":"…"}` },
  { group: "Services", target: "content.services.remove", label: "REMOVE a service", hint: 'Type "remove" — the named service is deleted', locator: "serviceName" },
  // FAQ (locator for updates + remove)
  { group: "FAQ", target: "content.faq.answer", label: "FAQ: answer", hint: "Plain text", locator: "faqQuestion" },
  { group: "FAQ", target: "content.faq.question", label: "FAQ: question (rename)", hint: "Plain text", locator: "faqQuestion" },
  { group: "FAQ", target: "content.faq.add", label: "ADD a new FAQ", hint: `JSON: {"question":"…","answer":"…"}` },
  { group: "FAQ", target: "content.faq.remove", label: "REMOVE an FAQ", hint: 'Type "remove" — the named question is deleted', locator: "faqQuestion" },
  // Testimonials (locator for updates + remove)
  { group: "Testimonials", target: "content.testimonials.quote", label: "Testimonial: quote", hint: "Plain text", locator: "testimonialName" },
  { group: "Testimonials", target: "content.testimonials.location", label: "Testimonial: location", hint: 'e.g. "Oxford"', locator: "testimonialName" },
  { group: "Testimonials", target: "content.testimonials.rating", label: "Testimonial: rating (1-5)", hint: "1, 2, 3, 4 or 5", locator: "testimonialName" },
  { group: "Testimonials", target: "content.testimonials.add", label: "ADD a new testimonial", hint: `JSON: {"name":"Sarah","location":"Oxford","quote":"…","rating":5}` },
  { group: "Testimonials", target: "content.testimonials.remove", label: "REMOVE a testimonial", hint: 'Type "remove" — the named testimonial is deleted', locator: "testimonialName" },
];

type PatchDraft = {
  target: string;
  newValue: string;
  serviceName: string;
  faqQuestion: string;
  testimonialName: string;
};

const blankPatch = (): PatchDraft => ({
  target: TARGET_SPECS[0]!.target,
  newValue: "",
  serviceName: "",
  faqQuestion: "",
  testimonialName: "",
});

type Props = {
  token: string;
  editId: string;
};

export default function DictatePatchPanel({ token, editId }: Props) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<PatchDraft[]>([blankPatch()]);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateDraft(idx: number, patch: Partial<PatchDraft>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  }
  function addDraft() {
    setDrafts((prev) => [...prev, blankPatch()]);
  }
  function removeDraft(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    // Local validation: each draft must have a newValue, and the
    // matching locator if the target needs one.
    for (const [i, d] of drafts.entries()) {
      const spec = TARGET_SPECS.find((s) => s.target === d.target);
      if (!d.newValue.trim()) {
        setError(`Patch ${i + 1}: new value is required.`);
        return;
      }
      if (spec?.locator === "serviceName" && !d.serviceName.trim()) {
        setError(`Patch ${i + 1}: service name is required for ${d.target}.`);
        return;
      }
      if (spec?.locator === "faqQuestion" && !d.faqQuestion.trim()) {
        setError(`Patch ${i + 1}: FAQ question is required for ${d.target}.`);
        return;
      }
      if (spec?.locator === "testimonialName" && !d.testimonialName.trim()) {
        setError(
          `Patch ${i + 1}: testimonial name is required for ${d.target}.`,
        );
        return;
      }
    }

    setPending(true);
    try {
      const body = {
        token,
        editId,
        patches: drafts.map((d) => {
          const spec = TARGET_SPECS.find((s) => s.target === d.target);
          const payload: Record<string, string> = {
            target: d.target,
            newValue: d.newValue.trim(),
          };
          // Only include locator fields when needed for the target.
          if (spec?.locator === "serviceName")
            payload.serviceName = d.serviceName.trim();
          if (spec?.locator === "faqQuestion")
            payload.faqQuestion = d.faqQuestion.trim();
          if (spec?.locator === "testimonialName")
            payload.testimonialName = d.testimonialName.trim();
          return payload;
        }),
        reply: reply.trim() || undefined,
      };
      const res = await fetch("/api/admin/dictate-patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        applied?: { target: string; newValue: unknown }[];
        build?: { dispatched: true } | { dispatched: false; reason: string };
        error?: string;
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Apply failed. Try again.");
        return;
      }
      const parts = [
        `Applied ${json.applied?.length ?? 0} patch${(json.applied?.length ?? 0) === 1 ? "" : "es"}.`,
      ];
      if (json.build?.dispatched) {
        parts.push("Build dispatched — customer will get the applied email soon.");
      } else if (json.build) {
        parts.push(`Build SKIPPED: ${json.build.reason}`);
      }
      setSuccess(parts.join(" "));
      // Auto-reload after a beat so the audit panel reflects the
      // newly-stamped patches without manual refresh.
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-navy-200 bg-cream-50 px-3 py-1.5 text-xs font-semibold text-navy-700 hover:border-navy-400"
      >
        + Dictate a patch (force-apply via Cowork)
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border-2 border-navy-200 bg-white p-4 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold uppercase tracking-wider text-navy-700">
          Dictate a patch
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-navy-400 hover:text-navy-700"
        >
          Cancel
        </button>
      </div>
      <p className="mt-1.5 text-navy-600">
        Force-apply a patch through Cowork&apos;s standard applier. Same
        validation + atomic Notion write as the auto-apply path. Multiple
        patches go in one Notion write + dispatch a single build.
      </p>

      <div className="mt-3 space-y-3">
        {drafts.map((d, i) => {
          const spec = TARGET_SPECS.find((s) => s.target === d.target);
          return (
            <div
              key={i}
              className="rounded-lg border border-navy-100 bg-cream-50 p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-semibold text-navy-500">
                  Patch {i + 1}
                </p>
                {drafts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDraft(i)}
                    className="text-[10px] text-navy-400 hover:text-ember-700"
                  >
                    Remove
                  </button>
                )}
              </div>
              <label className="mt-1.5 block">
                <span className="text-[10px] font-semibold text-navy-700">
                  Target
                </span>
                <select
                  value={d.target}
                  onChange={(e) =>
                    updateDraft(i, {
                      target: e.target.value,
                      // Reset locators when target group changes.
                      serviceName: "",
                      faqQuestion: "",
                      testimonialName: "",
                    })
                  }
                  className="mt-0.5 w-full rounded border border-navy-200 bg-white px-2 py-1 text-xs"
                >
                  {[
                    "Copy",
                    "Business",
                    "Trust",
                    "Branding",
                    "Services",
                    "FAQ",
                    "Testimonials",
                  ].map((g) => (
                    <optgroup key={g} label={g}>
                      {TARGET_SPECS.filter((s) => s.group === g).map((s) => (
                        <option key={s.target} value={s.target}>
                          {s.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {spec?.locator === "serviceName" && (
                <label className="mt-2 block">
                  <span className="text-[10px] font-semibold text-navy-700">
                    Service name (must match exactly)
                  </span>
                  <input
                    type="text"
                    value={d.serviceName}
                    onChange={(e) =>
                      updateDraft(i, { serviceName: e.target.value })
                    }
                    placeholder='e.g. "Garden Pods"'
                    className="mt-0.5 w-full rounded border border-navy-200 bg-white px-2 py-1 text-xs"
                  />
                </label>
              )}
              {spec?.locator === "faqQuestion" && (
                <label className="mt-2 block">
                  <span className="text-[10px] font-semibold text-navy-700">
                    FAQ question (must match exactly)
                  </span>
                  <input
                    type="text"
                    value={d.faqQuestion}
                    onChange={(e) =>
                      updateDraft(i, { faqQuestion: e.target.value })
                    }
                    placeholder='e.g. "Do you provide free quotes?"'
                    className="mt-0.5 w-full rounded border border-navy-200 bg-white px-2 py-1 text-xs"
                  />
                </label>
              )}
              {spec?.locator === "testimonialName" && (
                <label className="mt-2 block">
                  <span className="text-[10px] font-semibold text-navy-700">
                    Testimonial name (must match exactly)
                  </span>
                  <input
                    type="text"
                    value={d.testimonialName}
                    onChange={(e) =>
                      updateDraft(i, { testimonialName: e.target.value })
                    }
                    placeholder='e.g. "John"'
                    className="mt-0.5 w-full rounded border border-navy-200 bg-white px-2 py-1 text-xs"
                  />
                </label>
              )}
              <label className="mt-2 block">
                <span className="text-[10px] font-semibold text-navy-700">
                  New value
                </span>
                <textarea
                  value={d.newValue}
                  onChange={(e) => updateDraft(i, { newValue: e.target.value })}
                  rows={3}
                  placeholder={spec?.hint ?? ""}
                  className="mt-0.5 w-full rounded border border-navy-200 bg-white px-2 py-1 font-mono text-[11px]"
                />
                {spec?.hint && (
                  <span className="mt-0.5 block text-[10px] text-navy-500">
                    Format: {spec.hint}
                  </span>
                )}
              </label>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addDraft}
          className="text-[11px] font-semibold text-navy-700 underline decoration-dotted hover:text-ember-700"
        >
          + Add another patch
        </button>
      </div>

      <label className="mt-3 block">
        <span className="text-[10px] font-semibold text-navy-700">
          Reply to customer (optional)
        </span>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          placeholder="Optional note — included on the resolved edit."
          className="mt-0.5 w-full rounded border border-navy-200 bg-white px-2 py-1 text-xs"
        />
      </label>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded border border-ember-200 bg-ember-50 p-2 text-[11px] text-ember-800"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="mt-2 rounded border border-green-200 bg-green-50 p-2 text-[11px] text-green-800"
        >
          {success}
        </p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-navy-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
        >
          {pending ? "Applying…" : `Apply ${drafts.length} patch${drafts.length === 1 ? "" : "es"} + deploy`}
        </button>
      </div>
    </div>
  );
}
