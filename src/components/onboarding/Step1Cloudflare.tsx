"use client";

// Onboarding Hub — Step 1: Cloudflare account setup.
//
// Flow (corrected from the original H1 ship):
//   1. Customer signs up at cloudflare.com (their email)
//   2. Customer logs in → Manage Account → Members → Invite
//   3. Customer enters MY email and picks the Administrator role
//   4. Customer pastes their signup email back here so I know whose
//      invitation to expect when it lands in my inbox, and ticks
//      "Mark this step done"
//   5. I accept the invite from my end and can now deploy to their
//      Cloudflare account
//
// Cloudflare doesn't let me add myself to a brand-new customer
// account — the Members API requires the inviter to already be a
// member. So the customer initiates the invitation from inside their
// own dashboard.

import { useState } from "react";

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  /** The email the customer should invite as a Cloudflare team member. */
  benEmail: string;
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

const SIGNUP_URL = "https://dash.cloudflare.com/sign-up";
const MEMBERS_HELP_URL =
  "https://developers.cloudflare.com/fundamentals/manage-members/manage/";

export default function Step1Cloudflare({
  data,
  done,
  readOnly,
  benEmail,
  savePartial,
  markDone,
}: Props) {
  const initialEmail =
    typeof data.cloudflareEmail === "string" ? data.cloudflareEmail : "";
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [email, setEmail] = useState(initialEmail);
  const [notes, setNotes] = useState(initialNotes);
  const [pending, setPending] = useState<"none" | "save" | "done">("none");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function validateEmail(v: string): string | null {
    const trimmed = v.trim();
    if (trimmed.length === 0) return "Email is required to mark this step done.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return "That doesn't look like an email address.";
    }
    return null;
  }

  async function handleSave() {
    setError(null);
    setPending("save");
    const ok = await savePartial({
      cloudflareEmail: email.trim(),
      notes: notes.trim(),
    });
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

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(benEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore — copy not supported on some older browsers.
    }
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
          create your own account — the hosting is yours from day one.
          Then you&apos;ll add me as a team member so I can deploy your
          site to it.
        </p>
      </header>

      <section className="mt-7">
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          What to do
        </h3>
        <ol className="mt-4 space-y-4 text-[0.95rem] leading-relaxed text-navy-700">
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
              keep your hosting login under. Confirm the verification
              email Cloudflare sends.
            </span>
          </li>
          <li className="flex gap-3">
            <Bullet n={2} />
            <span>
              Once signed in, click <strong>Manage Account</strong> in
              the left sidebar, then <strong>Members</strong>, then{" "}
              <strong>Invite</strong>. (
              <a
                href={MEMBERS_HELP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                Cloudflare&apos;s help page
              </a>{" "}
              if you get stuck.)
            </span>
          </li>
          <li className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Bullet n={3} />
              <span>
                Invite this email as an{" "}
                <strong>Administrator</strong>:
              </span>
            </div>
            <InviteCallout
              email={benEmail}
              copied={copied}
              onCopy={handleCopyEmail}
            />
          </li>
          <li className="flex gap-3">
            <Bullet n={4} />
            <span>
              Send the invite. Then come back here, paste your signup
              email below so I know which invitation to look out for,
              and tick <em>Mark this step done</em>.
            </span>
          </li>
        </ol>
      </section>

      <section className="mt-8 rounded-2xl bg-cream-50 p-5">
        <h3 className="font-serif text-base font-semibold text-navy-900">
          What &ldquo;Administrator&rdquo; means
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-navy-700">
          Administrator lets me deploy your site and edit your DNS
          records. It does <strong>not</strong> let me delete your
          account, change your billing, or make myself the account
          owner — only you can do those things. You can revoke my
          access at any time from the same Members screen, with one
          click.
        </p>
      </section>

      <section className="mt-8 grid gap-5">
        <label className="block">
          <span className="block text-sm font-semibold text-navy-900">
            Your Cloudflare signup email
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
            The email you used at cloudflare.com/sign-up — same one your
            invitation will come from.
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

function InviteCallout({
  email,
  copied,
  onCopy,
}: {
  email: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="ml-9 rounded-xl border-2 border-navy-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-navy-500">
        Invite this email
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <code className="break-all rounded-lg bg-cream-50 px-3 py-1.5 font-mono text-base text-navy-900">
          {email}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-700"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs text-navy-600">
        Role to pick: <strong>Administrator</strong>
      </p>
    </div>
  );
}
