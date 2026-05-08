"use client";

// Onboarding Hub — Step 3: Connect your tools.
//
// Conditional on the Booking (Cal.com) and/or GBP-addon modules. If
// the customer bought neither, this step doesn't render at all
// (deriveStepList in lib/onboarding.ts marks it inapplicable).
//
// Customer's job:
//   - Booking: sign up at cal.com themselves, set up an event type,
//     paste the public booking URL here. We embed their URL on the
//     built site — no admin access needed.
//   - GBP: claim or create their listing at business.google.com,
//     add me (BEN_OPS_EMAIL) as a Manager, paste the public
//     GBP URL here.
//
// My job (after they tick done):
//   - Booking: parse username + event slug from the URL, configure
//     the Cal.com embed in the build pipeline.
//   - GBP: accept the manager invitation; audit the listing; set up
//     primary category, opening hours, photos, services. Add a
//     "Find us on Google" link to their site footer.

import { useState } from "react";

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  /** The email customers should invite as a GBP manager. Same one
   *  used for Cloudflare (Step 1) and Resend (Step 2). */
  benEmail: string;
  /** Prospect's purchased module names (e.g. "Online Booking",
   *  "Google Business Profile Setup/Audit"). Drives which sub-cards
   *  render and which fields are required. */
  modules: string[];
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

const CALCOM_SIGNUP_URL = "https://cal.com/signup";
const CALCOM_EVENTS_HELP_URL =
  "https://cal.com/help/setting-up-event-types";
const GBP_HOME_URL = "https://business.google.com";
const GBP_MANAGER_HELP_URL =
  "https://support.google.com/business/answer/3403100";

export default function Step3Tools({
  data,
  done,
  readOnly,
  benEmail,
  modules,
  savePartial,
  markDone,
}: Props) {
  const initialCalcom =
    typeof data.calcomBookingUrl === "string" ? data.calcomBookingUrl : "";
  const initialGbpUrl =
    typeof data.gbpUrl === "string" ? data.gbpUrl : "";
  const initialGbpInvited = data.gbpManagerInvited === true;
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [calcomUrl, setCalcomUrl] = useState(initialCalcom);
  const [gbpUrl, setGbpUrl] = useState(initialGbpUrl);
  const [gbpInvited, setGbpInvited] = useState(initialGbpInvited);
  const [notes, setNotes] = useState(initialNotes);

  // "update" is the post-done re-save (data correction without
  // toggling done off). Stage 2B-safe; Stage 2C ops need to detect
  // and re-trigger downstream work — see ARCHITECTURE.md §6.
  const [pending, setPending] = useState<
    "none" | "save" | "done" | "update"
  >("none");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasBooking = modules.includes("Online Booking");
  const hasGbp = modules.includes("Google Business Profile Setup/Audit");

  function buildPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = { notes: notes.trim() };
    if (hasBooking) patch.calcomBookingUrl = calcomUrl.trim();
    if (hasGbp) {
      patch.gbpUrl = gbpUrl.trim();
      patch.gbpManagerInvited = gbpInvited;
    }
    return patch;
  }

  function validateForDone(): string | null {
    if (hasBooking) {
      const url = calcomUrl.trim();
      if (!url) return "Please paste your Cal.com booking URL.";
      try {
        const parsed = new URL(url);
        const ok =
          parsed.hostname === "cal.com" ||
          parsed.hostname === "www.cal.com" ||
          parsed.hostname.endsWith(".cal.com");
        if (!ok)
          return "That doesn't look like a cal.com URL — it should start with https://cal.com/.";
      } catch {
        return "That Cal.com URL doesn't look valid.";
      }
    }
    if (hasGbp) {
      const url = gbpUrl.trim();
      if (!url)
        return "Please paste your Google Business Profile URL (e.g. https://g.page/...).";
      if (!/^https?:\/\//i.test(url)) {
        return "Please include https:// at the start of your GBP URL.";
      }
      if (!gbpInvited)
        return "Please tick the box once you've added me as a Manager on your GBP.";
    }
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
    // Re-save without toggling done off. Same validation as
    // mark-done so the saved data stays consistent.
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

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(benEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers — no-op.
    }
  }

  // Inputs stay editable after done so the customer can correct
  // mistakes; the Update button re-saves without toggling done off.
  const disabled = readOnly;
  const labelHeader =
    hasBooking && hasGbp
      ? "your booking page and Google Business Profile"
      : hasBooking
        ? "your booking page"
        : "your Google Business Profile";

  return (
    <article className="rounded-3xl bg-white p-7 shadow-card md:p-10">
      <header className="border-b border-navy-100 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
          Step 3
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
          Connect your tools
        </h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
          {hasBooking && hasGbp ? (
            <>
              Two short bits in this step: set up your Cal.com booking
              page so I can embed it on your site, and add me as a
              Manager on your Google Business Profile so I can audit and
              optimise your listing.
            </>
          ) : hasBooking ? (
            <>
              Set up a free Cal.com booking page and paste the link
              here. I&apos;ll embed it on your site so customers can
              book straight from your homepage.
            </>
          ) : (
            <>
              Add me as a Manager on your Google Business Profile and
              paste your GBP link here. I&apos;ll audit the listing,
              set up your categories, opening hours, photos and
              services — and add a &ldquo;Find us on Google&rdquo; link
              to your site footer.
            </>
          )}
        </p>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-navy-600">
          You own {labelHeader}. If you ever leave, you keep your
          account and the bookings / listing carry on running.
        </p>
      </header>

      {/* ---------- A. Cal.com ---------- */}
      {hasBooking && (
        <section className="mt-7">
          <h3 className="font-serif text-lg font-semibold text-navy-900">
            A. Cal.com booking page
          </h3>

          <ol className="mt-4 space-y-4 text-[0.95rem] leading-relaxed text-navy-700">
            <li className="flex gap-3">
              <Bullet n={1} />
              <span>
                Open{" "}
                <a
                  href={CALCOM_SIGNUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  cal.com/signup
                </a>{" "}
                in a new tab and create a free account. Pick a username
                that fits your business — that becomes part of your
                booking URL (e.g. <code>cal.com/sarah-plumbing</code>).
              </span>
            </li>
            <li className="flex gap-3">
              <Bullet n={2} />
              <span>
                Connect your calendar (Google, Apple or Outlook).
                Cal.com walks you through this on first login.
              </span>
            </li>
            <li className="flex gap-3">
              <Bullet n={3} />
              <span>
                Set up your booking event — duration, buffer time,
                availability. Cal.com starts you with a 30-minute
                meeting; rename or replace it to match what you offer
                (call-out, consult, site visit). (
                <a
                  href={CALCOM_EVENTS_HELP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  Cal.com&apos;s help
                </a>{" "}
                if you get stuck.)
              </span>
            </li>
            <li className="flex gap-3">
              <Bullet n={4} />
              <span>
                Copy your booking URL from your Cal.com dashboard
                (looks like <code>https://cal.com/your-name/30min</code>)
                and paste it below.
              </span>
            </li>
          </ol>

          <label className="mt-5 block">
            <span className="block text-sm font-semibold text-navy-900">
              Your Cal.com booking URL
            </span>
            <input
              type="url"
              value={calcomUrl}
              disabled={disabled}
              onChange={(e) => setCalcomUrl(e.target.value)}
              placeholder="https://cal.com/your-name/30min"
              autoComplete="url"
              className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 font-mono text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
            <span className="mt-1.5 block text-xs text-navy-500">
              Must be on cal.com — paste the public link from your
              dashboard.
            </span>
          </label>

          <p className="mt-4 rounded-xl bg-cream-50 p-4 text-sm leading-relaxed text-navy-700">
            <strong className="text-navy-900">No team invite needed.</strong>{" "}
            I&apos;m embedding your public URL — Cal.com runs entirely
            in your account. Bookings come straight to your calendar
            and inbox.
          </p>
        </section>
      )}

      {/* ---------- B. GBP ---------- */}
      {hasGbp && (
        <section className={`mt-${hasBooking ? "9" : "7"} rounded-2xl bg-cream-50 p-6`}>
          <h3 className="font-serif text-lg font-semibold text-navy-900">
            {hasBooking ? "B." : "A."} Google Business Profile
          </h3>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-navy-700">
            Your GBP is how most local customers find you in Google
            Search and Maps. I&apos;ll audit yours (or set one up if you
            don&apos;t have one yet), pick the right categories, write
            a search-friendly description, fill in opening hours,
            services and photos.
          </p>

          <ol className="mt-5 space-y-4 text-[0.95rem] leading-relaxed text-navy-700">
            <li className="flex gap-3">
              <Bullet n={1} />
              <span>
                Go to your Business Profile (sign in at{" "}
                <a
                  href={GBP_HOME_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  business.google.com
                </a>
                ). If you don&apos;t have a listing yet, click{" "}
                <strong>Add your business to Google</strong> and
                follow the verification steps first.
              </span>
            </li>
            <li className="flex gap-3">
              <Bullet n={2} />
              <span>
                Select <strong>More</strong> →{" "}
                <strong>Business Profile settings</strong> →{" "}
                <strong>People and access</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <Bullet n={3} />
              <span>
                At the top left, select <strong>Add</strong> →{" "}
                <strong>Invite new users</strong>.
              </span>
            </li>
            <li className="flex flex-col gap-3">
              <div className="flex gap-3">
                <Bullet n={4} />
                <span>
                  Enter this email address. Under{" "}
                  <strong>Access</strong>, select{" "}
                  <strong>Manager</strong>. Click{" "}
                  <strong>Invite</strong>.
                </span>
              </div>
              <InviteCallout
                email={benEmail}
                copied={copied}
                onCopy={handleCopyEmail}
              />
            </li>
            <li className="flex gap-3">
              <Bullet n={5} />
              <span>
                Paste your GBP URL below and tick that you&apos;ve
                added me. I&apos;ll accept and start the audit/setup.
                (
                <a
                  href={GBP_MANAGER_HELP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  Google&apos;s help on adding users
                </a>{" "}
                if you get stuck.)
              </span>
            </li>
          </ol>

          <div className="mt-4 rounded-xl bg-white p-4 text-xs leading-relaxed text-navy-600">
            <p className="font-semibold text-navy-900">Useful tips</p>
            <ul className="mt-2 ml-4 list-disc space-y-1">
              <li>
                I can accept the invite immediately — no waiting around
                for verification.
              </li>
              <li>
                You can see all current users and pending invites on
                the same <strong>People and access</strong> page.
              </li>
              <li>
                To revoke my access at any time: open{" "}
                <strong>People and access</strong>, find me in the
                list, click my role and select{" "}
                <strong>Remove access</strong>. (For a pending invite:
                under the <strong>PENDING</strong> section, find me and
                click <strong>Cancel invitation</strong>.)
              </li>
              <li>
                <strong>Pick Manager, not Owner.</strong> Manager gives
                me everything I need to audit and update the listing.
                Owner would let me transfer the listing&apos;s primary
                ownership — which I&apos;d never do, but the option
                shouldn&apos;t exist in the first place.
              </li>
            </ul>
          </div>

          <label className="mt-6 block">
            <span className="block text-sm font-semibold text-navy-900">
              Your Google Business Profile URL
            </span>
            <input
              type="url"
              value={gbpUrl}
              disabled={disabled}
              onChange={(e) => setGbpUrl(e.target.value)}
              placeholder="https://g.page/your-business"
              autoComplete="url"
              className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 font-mono text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
            <span className="mt-1.5 block text-xs text-navy-500">
              Either your short g.page link or the full Google Maps URL
              for your business — whichever you have.
            </span>
          </label>

          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={gbpInvited}
              disabled={disabled}
              onChange={(e) => setGbpInvited(e.target.checked)}
              className="mt-1 h-5 w-5 flex-none rounded border-2 border-navy-300 accent-navy-900"
            />
            <span className="min-w-0 text-[0.95rem] leading-relaxed text-navy-700">
              <span className="font-semibold text-navy-900">
                I&apos;ve added you as a Manager on my GBP listing.
              </span>
              <span className="mt-1 block text-xs text-navy-500">
                You can revoke my access any time from the same Users
                screen.
              </span>
            </span>
          </label>
        </section>
      )}

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
            placeholder="e.g. my GBP is still pending Google verification — should be cleared by next week"
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
        Role to pick: <strong>Manager</strong>
      </p>
    </div>
  );
}
