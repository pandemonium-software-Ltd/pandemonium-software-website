"use client";

// Onboarding Hub — Step 2: Domain only.
//
// Customer's job: tell me your domain and where it's (going to be)
// registered. Mark-done = "the domain exists at a registrar and I'm
// ready for you to take over". My downstream job: add the zone to
// their Cloudflare, email them the assigned nameservers + per-
// registrar instructions, poll until propagated, email
// confirmation.
//
// Resend / Cal.com / GBP module setup all moved to Step 3 (Modules)
// — those are customer-purchased modules, not universal infrastructure.

import { useState } from "react";

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

const CLOUDFLARE_REGISTRAR_URL =
  "https://dash.cloudflare.com/?to=/:account/domains/register";

type Registrar = "already-have" | "cloudflare" | "external";

export default function Step2Domain({
  data,
  done,
  readOnly,
  savePartial,
  markDone,
}: Props) {
  const initialDomain = typeof data.domain === "string" ? data.domain : "";
  const initialRegistrar =
    data.registrar === "already-have" ||
    data.registrar === "cloudflare" ||
    data.registrar === "external"
      ? (data.registrar as Registrar)
      : "";
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [domain, setDomain] = useState(initialDomain);
  const [registrar, setRegistrar] = useState<Registrar | "">(initialRegistrar);
  const [notes, setNotes] = useState(initialNotes);

  // "update" is the post-done re-save (data correction without
  // toggling done off). Stage 2B-safe; Stage 2C ops need to detect
  // and re-trigger downstream work — see ARCHITECTURE.md §6.
  const [pending, setPending] = useState<
    "none" | "save" | "done" | "update"
  >("none");
  const [error, setError] = useState<string | null>(null);

  function buildPatch(): Record<string, unknown> {
    return {
      domain: domain.trim(),
      registrar: registrar || undefined,
      notes: notes.trim(),
    };
  }

  function validateForDone(): string | null {
    if (!domain.trim())
      return "Please enter your domain (e.g. yourbusiness.co.uk).";
    if (!registrar)
      return "Please pick where your domain is (or will be) registered.";
    return null;
  }

  async function handleSave() {
    setError(null);
    setPending("save");
    const ok = await savePartial(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't save just now. Try again.");
  }

  async function handleMarkDone() {
    const err = validateForDone();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setPending("done");
    const ok = await markDone(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't mark done. Try again.");
  }

  async function handleUpdate() {
    const err = validateForDone();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setPending("update");
    const ok = await savePartial(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't update just now. Try again.");
  }

  // Inputs stay editable even after done so the customer can correct
  // mistakes; the Update button re-saves without toggling done off.
  const disabled = readOnly;

  return (
    <article className="rounded-3xl bg-white p-7 shadow-card md:p-10">
      <header className="border-b border-navy-100 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
          Step 2
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
          Your domain
        </h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
          Tell me which domain you&apos;ll be using and confirm
          it&apos;s registered. I&apos;ll handle the DNS records on my
          side using the Cloudflare access you granted me in Step 1.
          Module-specific setup (sender email, booking page,
          Google Business Profile) happens in Step 3.
        </p>
      </header>

      <section className="mt-7">
        <label className="block">
          <span className="block text-sm font-semibold text-navy-900">
            Domain name
          </span>
          <input
            type="text"
            value={domain}
            disabled={disabled}
            onChange={(e) => setDomain(e.target.value.toLowerCase())}
            placeholder="yourbusiness.co.uk"
            autoComplete="url"
            className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 font-mono text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
          <span className="mt-1.5 block text-xs text-navy-500">
            Without &quot;https://&quot; or &quot;www.&quot; — just the
            bare domain.
          </span>
        </label>

        <fieldset className="mt-5">
          <legend className="mb-2 block text-sm font-semibold text-navy-900">
            Where is it (or where will it be) registered?
          </legend>
          <RegistrarOption
            value="already-have"
            current={registrar}
            disabled={disabled}
            onChange={setRegistrar}
            title="I already have my domain"
            blurb={
              <>
                Registered anywhere — 123-reg, GoDaddy, Namecheap,
                Fasthosts, Heart Internet, anyone. You don&apos;t need
                to transfer it. I&apos;ll add it to your Cloudflare
                account and email you the two nameservers (small
                strings like <code>aron.ns.cloudflare.com</code>) to
                paste into your registrar&apos;s control panel.
                Cloudflare then handles your DNS while your existing
                registrar keeps handling your annual renewal.
              </>
            }
          />
          <RegistrarOption
            value="cloudflare"
            current={registrar}
            disabled={disabled}
            onChange={setRegistrar}
            title="I want to register a new domain through Cloudflare"
            blurb={
              <>
                Cleanest setup — no nameservers to point because the
                domain lives on Cloudflare from day one. From your
                Cloudflare dashboard, go to{" "}
                <a
                  href={CLOUDFLARE_REGISTRAR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  Domain Registration
                </a>{" "}
                and search for the name you want. £8–£12/year for most
                .co.uk and .com names. Once registered, mark this step
                done and I&apos;ll deploy your site straight to it.
              </>
            }
          />
          <RegistrarOption
            value="external"
            current={registrar}
            disabled={disabled}
            onChange={setRegistrar}
            title="I&rsquo;ll be registering it elsewhere"
            blurb={
              <>
                Buy it at the registrar of your choice (123-reg,
                GoDaddy, Namecheap, etc.), then come back here and
                mark this step done. Same as the existing-domain path
                above — I&apos;ll add the domain to your Cloudflare
                and email you the nameservers to update at your
                registrar.
              </>
            }
          />
        </fieldset>

        {/* What happens after the customer ticks done — content
            adapts to the chosen registrar option. */}
        {registrar && (
          <div className="mt-5 rounded-2xl border-2 border-navy-100 bg-cream-50 p-5">
            <p className="text-xs uppercase tracking-wider text-navy-500">
              What happens after you tick &ldquo;Mark this step done&rdquo;
            </p>
            {registrar === "cloudflare" ? (
              <p className="mt-2 text-[0.95rem] leading-relaxed text-navy-700">
                Once you&apos;ve completed the Cloudflare registration,
                I add the domain to your account, set up DNS records
                for your site, and deploy. No nameserver changes
                needed from your side — the domain is already on
                Cloudflare. <strong>Live within an hour.</strong>
              </p>
            ) : (
              <ol className="mt-2 ml-4 list-decimal space-y-1.5 text-[0.95rem] leading-relaxed text-navy-700">
                <li>I add your domain as a zone in your Cloudflare account.</li>
                <li>
                  I email you the two nameserver values Cloudflare
                  assigned, with a step-by-step for your specific
                  registrar (123-reg, GoDaddy, etc.).
                </li>
                <li>
                  You log in to your registrar and paste the
                  nameservers into the &ldquo;custom nameservers&rdquo;
                  field. Takes about 5 minutes.
                </li>
                <li>
                  Cloudflare propagates the change (24-48 hours,
                  usually much faster). I&apos;ll email you when it&apos;s
                  active and your site goes live.
                </li>
              </ol>
            )}
          </div>
        )}

        {/* Transfer-vs-nameserver-swap explainer aside. */}
        <div className="mt-5 rounded-xl bg-white p-5 text-sm leading-relaxed text-navy-600 ring-1 ring-navy-100">
          <p className="font-semibold text-navy-900">
            Wait — do I need to transfer my domain to Cloudflare?
          </p>
          <p className="mt-2">
            <strong>No.</strong> A &ldquo;transfer&rdquo; means moving
            the domain registration itself from one registrar to
            another — that takes 5-7 days, costs ~£8-12 in transfer
            fees, and isn&apos;t needed for any of this. We&apos;re
            doing a <strong>nameserver swap</strong>, which is
            different: your domain stays at your existing registrar (so
            renewals carry on as they were), but DNS lookups get
            answered by Cloudflare instead. Free, fast, reversible
            with one paste.
          </p>
        </div>
      </section>

      {/* ---------- Notes + buttons ---------- */}
      <section className="mt-7">
        <label className="block">
          <span className="block text-sm font-semibold text-navy-900">
            Anything I should know? (optional)
          </span>
          <textarea
            value={notes}
            disabled={disabled}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. I bought the domain through 123-reg and I'm not sure how to change nameservers"
            rows={3}
            maxLength={2000}
            className="mt-2 w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </label>

        {error && (
          <p className="mt-4 text-sm text-ember-700" role="alert">
            {error}
          </p>
        )}
      </section>

      <footer className="mt-7 flex flex-wrap items-center gap-3 border-t border-navy-100 pt-6">
        {done ? (
          <>
            <p className="text-sm text-green-700" role="status">
              <strong>Done.</strong> Edit above and click Update if
              anything changes.
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={handleUpdate}
                disabled={pending !== "none"}
                className="btn-secondary"
              >
                {pending === "update" ? "Updating…" : "Update saved data"}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending !== "none" || disabled}
              className="btn-secondary"
            >
              {pending === "save" ? "Saving…" : "Save progress"}
            </button>
            <button
              type="button"
              onClick={handleMarkDone}
              disabled={pending !== "none" || disabled}
              className="btn-primary"
            >
              {pending === "done"
                ? "Marking done…"
                : "Mark this step done"}
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

// ---------- Registrar radio option ----------

function RegistrarOption({
  value,
  current,
  disabled,
  onChange,
  title,
  blurb,
}: {
  value: Registrar;
  current: Registrar | "";
  disabled: boolean;
  onChange: (v: Registrar) => void;
  title: string;
  blurb: React.ReactNode;
}) {
  const checked = current === value;
  return (
    <label
      className={[
        "mt-2 flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors",
        checked
          ? "border-navy-900 bg-white"
          : "border-navy-200 bg-white hover:border-navy-300",
        disabled ? "cursor-default opacity-90" : "",
      ].join(" ")}
    >
      <input
        type="radio"
        name="registrar"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-1 h-5 w-5 flex-none accent-navy-900"
      />
      <span className="min-w-0">
        <span
          className="block font-serif text-base font-semibold text-navy-900"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <span className="mt-1 block text-[0.9rem] leading-relaxed text-navy-700">
          {blurb}
        </span>
      </span>
    </label>
  );
}
