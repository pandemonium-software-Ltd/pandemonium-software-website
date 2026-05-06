"use client";

// Onboarding Hub — Step 1: Cloudflare account setup.
//
// Customer creates their own free Cloudflare account, then shares the
// signup email so I can send them a "team member" invite to deploy
// their site to their account. They own the hosting from day one.
//
// Saves the email to Onboarding Data via POST /api/onboarding. The
// "Mark this step done" gate also requires the email to be present
// (server-side guard in canMarkStepDone).

import { useState } from "react";

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

const SIGNUP_URL = "https://dash.cloudflare.com/sign-up";

export default function Step1Cloudflare({
  data,
  done,
  readOnly,
  savePartial,
  markDone,
}: Props) {
  const initialEmail = typeof data.cloudflareEmail === "string"
    ? data.cloudflareEmail
    : "";
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [email, setEmail] = useState(initialEmail);
  const [notes, setNotes] = useState(initialNotes);
  const [pending, setPending] = useState<"none" | "save" | "done">("none");
  const [error, setError] = useState<string | null>(null);

  function validateEmail(v: string): string | null {
    const trimmed = v.trim();
    if (trimmed.length === 0) return "Email is required to mark this step done.";
    // Loose email regex — server validates with zod.email() too.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return "That doesn't look like an email address.";
    }
    return null;
  }

  async function handleSave() {
    setError(null);
    setPending("save");
    const trimmed = { cloudflareEmail: email.trim(), notes: notes.trim() };
    const ok = await savePartial(trimmed);
    setPending("none");
    if (!ok) setError("Couldn't save just now. Try again.");
  }

  async function handleMarkDone() {
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    setError(null);
    setPending("done");
    const ok = await markDone({
      cloudflareEmail: email.trim(),
      notes: notes.trim(),
    });
    setPending("none");
    if (!ok) setError("Couldn't mark done. Try again.");
  }

  const disabled = readOnly || done;

  return (
    <article className="rounded-3xl bg-white p-7 shadow-card md:p-10">
      <header className="border-b border-navy-100 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
          Step 1
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
          Set up your Cloudflare account
        </h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
          Cloudflare hosts your website for free, forever. You&apos;ll
          create your own account so the hosting is yours from day one — if
          we ever part ways, your site keeps running and you owe nothing.
        </p>
      </header>

      <section className="mt-7 grid gap-7 md:grid-cols-[1fr_1fr]">
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy-900">
            What to do
          </h3>
          <ol className="mt-3 space-y-3 text-[0.95rem] leading-relaxed text-navy-700">
            <li className="flex gap-3">
              <Bullet n={1} />
              <span>
                Open{" "}
                <a
                  href={SIGNUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  cloudflare.com/sign-up
                </a>{" "}
                in a new tab and sign up with the email you&apos;d like to
                keep your hosting login under.
              </span>
            </li>
            <li className="flex gap-3">
              <Bullet n={2} />
              <span>
                Confirm the verification email Cloudflare sends. You can
                skip every &ldquo;getting started&rdquo; prompt — I&apos;ll
                handle setup from your account.
              </span>
            </li>
            <li className="flex gap-3">
              <Bullet n={3} />
              <span>
                Come back here, paste the same email below and tick{" "}
                <em>Mark this step done</em>. I&apos;ll send you a team
                member invitation, and once you accept I can deploy your
                site to your account.
              </span>
            </li>
          </ol>
        </div>

        <div>
          <h3 className="font-serif text-lg font-semibold text-navy-900">
            What I&apos;ll do next
          </h3>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-navy-700">
            From your email I&apos;ll add my Cloudflare account as a team
            member on yours, with deploy permissions only. You&apos;ll see
            the invite in your Cloudflare inbox — accept it and I can get
            the build moving. I never see your billing and I can&apos;t add
            anyone else.
          </p>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-navy-700">
            If you ever want me out: one click in your Cloudflare team
            settings and I&apos;m gone. The site keeps running.
          </p>
        </div>
      </section>

      <section className="mt-8 grid gap-5">
        <label className="block">
          <span className="block text-sm font-semibold text-navy-900">
            Cloudflare signup email
          </span>
          <input
            type="email"
            value={email}
            disabled={disabled}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourbusiness.co.uk"
            autoComplete="email"
            className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
          <span className="mt-1.5 block text-xs text-navy-500">
            The same email you used at cloudflare.com/sign-up.
          </span>
        </label>

        <label className="block">
          <span className="block text-sm font-semibold text-navy-900">
            Anything I should know? (optional)
          </span>
          <textarea
            value={notes}
            disabled={disabled}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. I had to use a different email than the one we'd discussed"
            rows={3}
            maxLength={2000}
            className="mt-2 w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </label>

        {error && (
          <p className="text-sm text-ember-700" role="alert">
            {error}
          </p>
        )}
      </section>

      <footer className="mt-7 flex flex-wrap items-center gap-3 border-t border-navy-100 pt-6">
        {done ? (
          <p className="text-sm text-green-700" role="status">
            <strong>Done.</strong> Saved email:{" "}
            <span className="font-mono">{email || "(not set)"}</span>
          </p>
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

function Bullet({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-navy-900 font-serif text-xs font-semibold text-white"
    >
      {n}
    </span>
  );
}
