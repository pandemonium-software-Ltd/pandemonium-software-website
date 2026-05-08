"use client";

// Onboarding Hub — Step 3: Modules.
//
// Replaces the old "Connect your tools" step. Customer-purchased
// modules each get their own collapsible card with a clear RAG
// status (red / amber / green). Cards default-expanded if not
// complete, default-collapsed if complete — so the customer scans
// the page and sees what still needs work.
//
// Sub-modules (only render if the corresponding module was bought):
//   - Sender email — Resend (Newsletter OR Enquiry Form)
//   - Online booking — Cal.com (Online Booking)
//   - Google Business Profile (GBP addon)
//
// Step 3 itself is hidden from the wizard if the customer bought
// none of the four. See deriveStepList in lib/onboarding.ts.

import { useState } from "react";
import type { ReactNode } from "react";

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  /** Email customers invite as Resend / GBP team member. */
  benEmail: string;
  /** Prospect's purchased module names. */
  modules: string[];
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

const RESEND_SIGNUP_URL = "https://resend.com/signup";
const RESEND_TEAM_HELP_URL =
  "https://resend.com/docs/dashboard/teams/introduction";
const CALCOM_SIGNUP_URL = "https://cal.com/signup";
const CALCOM_EVENTS_HELP_URL =
  "https://cal.com/help/setting-up-event-types";
const GBP_HOME_URL = "https://business.google.com";
const GBP_MANAGER_HELP_URL =
  "https://support.google.com/business/answer/3403100";

type ModuleStatus = "not-started" | "in-progress" | "complete";

export default function Step3Modules({
  data,
  done,
  readOnly,
  benEmail,
  modules,
  savePartial,
  markDone,
}: Props) {
  // ---------- Initial state from saved data ----------

  const initialResendEmail =
    typeof data.resendSignupEmail === "string"
      ? data.resendSignupEmail
      : "";
  const initialResendInvited = data.resendInvitedMe === true;
  const initialCalcomUrl =
    typeof data.calcomBookingUrl === "string" ? data.calcomBookingUrl : "";
  const initialGbpUrl = typeof data.gbpUrl === "string" ? data.gbpUrl : "";
  const initialGbpInvited = data.gbpManagerInvited === true;
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [resendEmail, setResendEmail] = useState(initialResendEmail);
  const [resendInvited, setResendInvited] = useState(initialResendInvited);
  const [calcomUrl, setCalcomUrl] = useState(initialCalcomUrl);
  const [gbpUrl, setGbpUrl] = useState(initialGbpUrl);
  const [gbpInvited, setGbpInvited] = useState(initialGbpInvited);
  const [notes, setNotes] = useState(initialNotes);

  const [pending, setPending] = useState<
    "none" | "save" | "done" | "update"
  >("none");
  const [error, setError] = useState<string | null>(null);

  // Module applicability from the prospect's selections.
  const hasResend =
    modules.includes("Newsletter") || modules.includes("Enquiry Form");
  const hasCalcom = modules.includes("Online Booking");
  const hasGbp = modules.includes("Google Business Profile Setup/Audit");

  // ---------- Per-module status (drives RAG pills + initial collapse) ----------

  const resendStatus: ModuleStatus = !resendEmail && !resendInvited
    ? "not-started"
    : resendEmail.trim() && resendInvited
      ? "complete"
      : "in-progress";

  const calcomStatus: ModuleStatus = (() => {
    const url = calcomUrl.trim();
    if (!url) return "not-started";
    try {
      const parsed = new URL(url);
      const ok =
        parsed.hostname === "cal.com" ||
        parsed.hostname === "www.cal.com" ||
        parsed.hostname.endsWith(".cal.com");
      return ok ? "complete" : "in-progress";
    } catch {
      return "in-progress";
    }
  })();

  const gbpStatus: ModuleStatus = !gbpUrl && !gbpInvited
    ? "not-started"
    : gbpUrl.trim() && gbpInvited
      ? "complete"
      : "in-progress";

  // ---------- Save / mark-done / update ----------

  function buildPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = { notes: notes.trim() };
    if (hasResend) {
      patch.resendSignupEmail = resendEmail.trim();
      patch.resendInvitedMe = resendInvited;
    }
    if (hasCalcom) patch.calcomBookingUrl = calcomUrl.trim();
    if (hasGbp) {
      patch.gbpUrl = gbpUrl.trim();
      patch.gbpManagerInvited = gbpInvited;
    }
    return patch;
  }

  function validateForDone(): string | null {
    if (hasCalcom && calcomStatus !== "complete") {
      return calcomStatus === "in-progress"
        ? "That doesn't look like a cal.com URL — it should start with https://cal.com/."
        : "Please complete the Online booking module — paste your Cal.com URL.";
    }
    if (hasGbp && gbpStatus !== "complete") {
      if (!gbpUrl.trim())
        return "Please complete the Google Business Profile module — paste your GBP URL.";
      if (!gbpInvited)
        return "Please tick the box once you've added me as a Manager on your GBP listing.";
    }
    if (hasResend && resendStatus !== "complete") {
      if (!resendEmail.trim())
        return "Please complete the Sender email module — share your Resend signup email.";
      if (!resendInvited)
        return "Please tick the box once you've added me as a team member in Resend.";
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

  const disabled = readOnly;

  // ---------- Header copy ----------

  const moduleCount =
    (hasResend ? 1 : 0) + (hasCalcom ? 1 : 0) + (hasGbp ? 1 : 0);
  const completeCount =
    (hasResend && resendStatus === "complete" ? 1 : 0) +
    (hasCalcom && calcomStatus === "complete" ? 1 : 0) +
    (hasGbp && gbpStatus === "complete" ? 1 : 0);

  return (
    <article className="rounded-3xl bg-white p-7 shadow-card md:p-10">
      <header className="border-b border-navy-100 pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
              Step 3
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
              Modules
            </h2>
          </div>
          <span className="text-sm font-semibold text-navy-700">
            {completeCount} of {moduleCount} complete
          </span>
        </div>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
          Set up the modules you bought. Each card below is its own
          mini-step — green when complete, red when nothing&apos;s
          started yet, amber if there&apos;s some way to go. Click a
          card&apos;s header to expand or collapse.
        </p>
      </header>

      <section className="mt-7 space-y-4">
        {hasCalcom && (
          <ModuleCard
            title="Online booking"
            subtitle="Cal.com"
            status={calcomStatus}
          >
            <ModuleCalcom
              url={calcomUrl}
              onUrlChange={setCalcomUrl}
              disabled={disabled}
            />
          </ModuleCard>
        )}

        {hasResend && (
          <ModuleCard
            title="Sender email"
            subtitle="Resend"
            status={resendStatus}
          >
            <ModuleResend
              email={resendEmail}
              invited={resendInvited}
              onEmailChange={setResendEmail}
              onInvitedChange={setResendInvited}
              benEmail={benEmail}
              disabled={disabled}
            />
          </ModuleCard>
        )}

        {hasGbp && (
          <ModuleCard
            title="Google Business Profile"
            subtitle="business.google.com"
            status={gbpStatus}
          >
            <ModuleGbp
              url={gbpUrl}
              invited={gbpInvited}
              onUrlChange={setGbpUrl}
              onInvitedChange={setGbpInvited}
              benEmail={benEmail}
              disabled={disabled}
            />
          </ModuleCard>
        )}
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

// ---------- Collapsible module shell ----------

function ModuleCard({
  title,
  subtitle,
  status,
  children,
}: {
  title: string;
  subtitle: string;
  status: ModuleStatus;
  children: ReactNode;
}) {
  // Default-expanded if not complete (guides the customer to the
  // unfinished work); default-collapsed when green.
  const [expanded, setExpanded] = useState(status !== "complete");

  return (
    <div
      className={[
        "overflow-hidden rounded-2xl border-2 transition-colors",
        status === "complete"
          ? "border-green-200 bg-green-50/40"
          : status === "in-progress"
            ? "border-orange-200 bg-orange-50/40"
            : "border-red-200 bg-red-50/30",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/40"
      >
        <ModuleStatusBadge status={status} />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-lg font-semibold text-navy-900">
            {title}
          </p>
          <p className="text-xs text-navy-500">{subtitle}</p>
        </div>
        <Chevron expanded={expanded} />
      </button>
      {expanded && (
        <div className="border-t border-navy-100/60 bg-white px-5 py-5 md:px-6 md:py-6">
          {children}
        </div>
      )}
    </div>
  );
}

function ModuleStatusBadge({ status }: { status: ModuleStatus }) {
  const tone =
    status === "complete"
      ? { dot: "bg-green-500", pill: "bg-green-100 text-green-800" }
      : status === "in-progress"
        ? { dot: "bg-orange-500", pill: "bg-orange-100 text-orange-800" }
        : { dot: "bg-red-500", pill: "bg-red-100 text-red-800" };
  const label =
    status === "complete"
      ? "Complete"
      : status === "in-progress"
        ? "In progress"
        : "Not started";
  return (
    <span
      className={`inline-flex flex-none items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${tone.pill}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className={[
        "flex-none text-navy-500 transition-transform",
        expanded ? "rotate-180" : "",
      ].join(" ")}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------- Module: Cal.com ----------

function ModuleCalcom({
  url,
  onUrlChange,
  disabled,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <p className="text-[0.95rem] leading-relaxed text-navy-700">
        Set up a free Cal.com booking page and paste the link here.
        I&apos;ll embed it on your site — no team invite needed,
        Cal.com runs entirely in your account.
      </p>
      <ol className="mt-4 space-y-3 text-[0.95rem] leading-relaxed text-navy-700">
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
            and create a free account. Pick a username that fits your
            business — it becomes part of your booking URL.
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={2} />
          <span>
            Connect your calendar (Google / Apple / Outlook), set up
            an event type with the right duration, buffer and
            availability. (
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
          <Bullet n={3} />
          <span>
            Copy your booking URL (looks like{" "}
            <code>https://cal.com/your-name/30min</code>) and paste it
            below.
          </span>
        </li>
      </ol>
      <label className="mt-5 block">
        <span className="block text-sm font-semibold text-navy-900">
          Your Cal.com booking URL
        </span>
        <input
          type="url"
          value={url}
          disabled={disabled}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://cal.com/your-name/30min"
          autoComplete="url"
          className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 font-mono text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
        <span className="mt-1.5 block text-xs text-navy-500">
          Must be on cal.com — paste the public link from your
          dashboard.
        </span>
      </label>
    </>
  );
}

// ---------- Module: Resend (sender email) ----------

function ModuleResend({
  email,
  invited,
  onEmailChange,
  onInvitedChange,
  benEmail,
  disabled,
}: {
  email: string;
  invited: boolean;
  onEmailChange: (v: string) => void;
  onInvitedChange: (v: boolean) => void;
  benEmail: string;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(benEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  }
  return (
    <>
      <p className="text-[0.95rem] leading-relaxed text-navy-700">
        Resend is a free email-sending service. You sign up and add
        me as a team member — I run the technical side from there.
        Your sender email becomes <code>news@yourdomain</code> /{" "}
        <code>forms@yourdomain</code> with full DKIM and SPF set up
        on your existing domain.
      </p>
      <ol className="mt-4 space-y-3 text-[0.95rem] leading-relaxed text-navy-700">
        <li className="flex gap-3">
          <Bullet n={1} />
          <span>
            Open{" "}
            <a
              href={RESEND_SIGNUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              resend.com/signup
            </a>{" "}
            and create a free account. Free tier covers way more
            volume than a small business will ever send.
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={2} />
          <span>
            In Resend, click <strong>Settings</strong> →{" "}
            <strong>Team</strong> → <strong>Invite</strong>. (
            <a
              href={RESEND_TEAM_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Resend&apos;s help
            </a>{" "}
            if you get stuck.)
          </span>
        </li>
        <li className="flex flex-col gap-3">
          <div className="flex gap-3">
            <Bullet n={3} />
            <span>
              Invite this email as an <strong>Admin</strong>:
            </span>
          </div>
          <InviteCallout email={benEmail} copied={copied} onCopy={copy} role="Admin" />
        </li>
        <li className="flex gap-3">
          <Bullet n={4} />
          <span>
            Tell me your Resend signup email below and tick that
            you&apos;ve sent the invite.
          </span>
        </li>
      </ol>
      <label className="mt-5 block">
        <span className="block text-sm font-semibold text-navy-900">
          Your Resend signup email
        </span>
        <input
          type="email"
          value={email}
          disabled={disabled}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="you@yourbusiness.co.uk"
          autoComplete="email"
          className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
      </label>
      <label className="mt-4 flex items-start gap-3">
        <input
          type="checkbox"
          checked={invited}
          disabled={disabled}
          onChange={(e) => onInvitedChange(e.target.checked)}
          className="mt-1 h-5 w-5 flex-none rounded border-2 border-navy-300 accent-navy-900"
        />
        <span className="min-w-0 text-[0.95rem] leading-relaxed text-navy-700">
          <span className="font-semibold text-navy-900">
            I&apos;ve added you as a team member in Resend.
          </span>
          <span className="mt-1 block text-xs text-navy-500">
            I&apos;ll get an invitation email from your account once
            you&apos;ve sent it.
          </span>
        </span>
      </label>
    </>
  );
}

// ---------- Module: Google Business Profile ----------

function ModuleGbp({
  url,
  invited,
  onUrlChange,
  onInvitedChange,
  benEmail,
  disabled,
}: {
  url: string;
  invited: boolean;
  onUrlChange: (v: string) => void;
  onInvitedChange: (v: boolean) => void;
  benEmail: string;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(benEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  }
  return (
    <>
      <p className="text-[0.95rem] leading-relaxed text-navy-700">
        Your GBP is how most local customers find you in Google
        Search and Maps. I&apos;ll audit yours (or set one up if you
        don&apos;t have one), pick the right categories, write a
        search-friendly description, fill in opening hours, services
        and photos.
      </p>
      <ol className="mt-4 space-y-3 text-[0.95rem] leading-relaxed text-navy-700">
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
            <strong>Add your business to Google</strong> and follow
            the verification steps first.
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
              Enter this email. Under <strong>Access</strong>, select{" "}
              <strong>Manager</strong>. Click <strong>Invite</strong>.
            </span>
          </div>
          <InviteCallout
            email={benEmail}
            copied={copied}
            onCopy={copy}
            role="Manager"
          />
        </li>
        <li className="flex gap-3">
          <Bullet n={5} />
          <span>
            Paste your GBP URL below and tick that you&apos;ve added
            me. (
            <a
              href={GBP_MANAGER_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Google&apos;s help on adding users
            </a>
            .)
          </span>
        </li>
      </ol>
      <div className="mt-4 rounded-xl bg-cream-50 p-4 text-xs leading-relaxed text-navy-600">
        <p className="font-semibold text-navy-900">
          Pick Manager, not Owner.
        </p>
        <p className="mt-1.5">
          Manager gives me everything I need to audit and update the
          listing. Owner would let me transfer the listing&apos;s
          primary ownership — which I&apos;d never do, but the
          option shouldn&apos;t exist in the first place.
        </p>
      </div>
      <label className="mt-5 block">
        <span className="block text-sm font-semibold text-navy-900">
          Your Google Business Profile URL
        </span>
        <input
          type="url"
          value={url}
          disabled={disabled}
          onChange={(e) => onUrlChange(e.target.value)}
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
          checked={invited}
          disabled={disabled}
          onChange={(e) => onInvitedChange(e.target.checked)}
          className="mt-1 h-5 w-5 flex-none rounded border-2 border-navy-300 accent-navy-900"
        />
        <span className="min-w-0 text-[0.95rem] leading-relaxed text-navy-700">
          <span className="font-semibold text-navy-900">
            I&apos;ve added you as a Manager on my GBP listing.
          </span>
        </span>
      </label>
    </>
  );
}

// ---------- Shared bits ----------

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
  role,
}: {
  email: string;
  copied: boolean;
  onCopy: () => void;
  role: string;
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
        Role to pick: <strong>{role}</strong>
      </p>
    </div>
  );
}
