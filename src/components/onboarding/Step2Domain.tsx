"use client";

// Onboarding Hub — Step 2: Domain & email setup.
//
// Customer's job in this step: tell me your domain, register or
// connect it, and (if you bought Enquiry or Newsletter) sign up for
// Resend and add me as a team member.
//
// My job (after they tick done): use my Cloudflare Administrator
// access from Step 1 to add the website's DNS records, then use my
// Resend team membership to add their domain to Resend, generate the
// SPF / DKIM / Return-Path records, paste them into Cloudflare DNS
// (still on my side because I'm Admin there), and verify. The
// customer pastes nothing.

import { useState } from "react";

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  /** The email customers should invite as a Resend team member. Same
   *  as the Cloudflare invite from Step 1. */
  benEmail: string;
  /** Prospect's purchased module names (e.g. "Enquiry Form",
   *  "Newsletter"). Drives whether the Resend sub-card is shown. */
  modules: string[];
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

const RESEND_SIGNUP_URL = "https://resend.com/signup";
const RESEND_TEAM_HELP_URL = "https://resend.com/docs/dashboard/teams/introduction";
const CLOUDFLARE_REGISTRAR_URL =
  "https://dash.cloudflare.com/?to=/:account/domains/register";

type Registrar = "already-have" | "cloudflare" | "external";

export default function Step2Domain({
  data,
  done,
  readOnly,
  benEmail,
  modules,
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
  const initialDomainConnected = data.domainConnected === true;
  const initialResendEmail =
    typeof data.resendSignupEmail === "string" ? data.resendSignupEmail : "";
  const initialResendInvitedMe = data.resendInvitedMe === true;
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [domain, setDomain] = useState(initialDomain);
  const [registrar, setRegistrar] = useState<Registrar | "">(initialRegistrar);
  const [domainConnected, setDomainConnected] = useState(initialDomainConnected);
  const [resendEmail, setResendEmail] = useState(initialResendEmail);
  const [resendInvitedMe, setResendInvitedMe] = useState(initialResendInvitedMe);
  const [notes, setNotes] = useState(initialNotes);

  const [pending, setPending] = useState<"none" | "save" | "done">("none");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const needsResend =
    modules.includes("Enquiry Form") || modules.includes("Newsletter");

  function buildPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = {
      domain: domain.trim(),
      registrar: registrar || undefined,
      domainConnected,
      notes: notes.trim(),
    };
    if (needsResend) {
      patch.resendSignupEmail = resendEmail.trim();
      patch.resendInvitedMe = resendInvitedMe;
    }
    return patch;
  }

  function validateForDone(): string | null {
    if (!domain.trim()) return "Please enter your domain (e.g. yourbusiness.co.uk).";
    if (!registrar) return "Please pick where your domain is (or will be) registered.";
    if (!domainConnected) {
      return registrar === "already-have"
        ? "Please tick the box once you've added your existing domain to Cloudflare."
        : registrar === "cloudflare"
          ? "Please tick the box once you've finished registering through Cloudflare."
          : "Please tick the box once you've pointed your domain's nameservers to Cloudflare.";
    }
    if (needsResend) {
      if (!resendEmail.trim())
        return "Please share the email you signed up to Resend with.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resendEmail.trim()))
        return "That Resend email doesn't look quite right.";
      if (!resendInvitedMe)
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

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(benEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers — no-op.
    }
  }

  const disabled = readOnly || done;

  return (
    <article className="rounded-3xl bg-white p-7 shadow-card md:p-10">
      <header className="border-b border-navy-100 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
          Step 2
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
          Domain &amp; email setup
        </h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
          {needsResend ? (
            <>
              Two things in this step: tell me your domain, and (because
              you bought {modulesPretty(modules)}) get me set up on a free
              Resend account in your name so your forms and newsletters
              send from your domain. I&apos;ll handle every DNS record on
              my side — you don&apos;t paste a thing.
            </>
          ) : (
            <>
              Tell me which domain you&apos;ll be using, and confirm
              it&apos;s registered. I&apos;ll handle the DNS records on my
              side using the Cloudflare access you granted me in Step 1.
            </>
          )}
        </p>
      </header>

      {/* ---------- A. Domain ---------- */}
      <section className="mt-7">
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          A. Your domain
        </h3>

        <label className="mt-5 block">
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
            blurb="Registered with anyone (123-reg, GoDaddy, Namecheap, etc.). I&rsquo;ll show you how to point it to Cloudflare."
          />
          <RegistrarOption
            value="cloudflare"
            current={registrar}
            disabled={disabled}
            onChange={setRegistrar}
            title="I want to register a new domain through Cloudflare"
            blurb={
              <>
                Cleanest setup, no DNS to point. From your Cloudflare
                dashboard, go to{" "}
                <a
                  href={CLOUDFLARE_REGISTRAR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  Domain Registration
                </a>{" "}
                and search for the name you want. £8–£12/year for most
                .co.uk and .com names.
              </>
            }
          />
          <RegistrarOption
            value="external"
            current={registrar}
            disabled={disabled}
            onChange={setRegistrar}
            title="I&rsquo;ll be registering it elsewhere"
            blurb="No problem. Once you&rsquo;ve bought it, change its nameservers to Cloudflare&rsquo;s and tick the box below — I&rsquo;ll handle the rest."
          />
        </fieldset>

        <label className="mt-5 flex items-start gap-3">
          <input
            type="checkbox"
            checked={domainConnected}
            disabled={disabled}
            onChange={(e) => setDomainConnected(e.target.checked)}
            className="mt-1 h-5 w-5 flex-none rounded border-2 border-navy-300 accent-navy-900"
          />
          <span className="min-w-0 text-[0.95rem] leading-relaxed text-navy-700">
            <span className="font-semibold text-navy-900">
              My domain is registered and connected.
            </span>
            <span className="mt-1 block text-xs text-navy-500">
              Tick this once your domain exists at the registrar of your
              choice and (if external) its nameservers point to Cloudflare.
              I&apos;ll see it in your account on my next check.
            </span>
          </span>
        </label>
      </section>

      {/* ---------- B. Resend (conditional) ---------- */}
      {needsResend && (
        <section className="mt-9 rounded-2xl bg-cream-50 p-6">
          <h3 className="font-serif text-lg font-semibold text-navy-900">
            B. Resend (your sender plumbing)
          </h3>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-navy-700">
            Resend is a free email-sending service. You sign up, then add
            me as a team member — I run the technical side from there.
            Your sender email becomes{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[0.85rem] text-navy-900">
              {prettySender(domain) || "yourbusiness.co.uk"}
            </code>
            . If you ever leave, you keep your domain and your subscriber
            list — Resend itself is just plumbing.
          </p>

          <ol className="mt-5 space-y-4 text-[0.95rem] leading-relaxed text-navy-700">
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
                and create a free account. The free tier covers way more
                volume than a small business will ever send.
              </span>
            </li>
            <li className="flex gap-3">
              <Bullet n={2} />
              <span>
                In Resend, click <strong>Settings</strong> →{" "}
                <strong>Team</strong> →{" "}
                <strong>Invite</strong>. (
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
                <span>Invite this email — pick the Admin role:</span>
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
                Tell me your Resend signup email below and tick that
                you&apos;ve sent the invite. I&apos;ll accept from my end,
                add your domain, generate the records, and apply them to
                your Cloudflare DNS — no further action from you.
              </span>
            </li>
          </ol>

          <label className="mt-6 block">
            <span className="block text-sm font-semibold text-navy-900">
              Your Resend signup email
            </span>
            <input
              type="email"
              value={resendEmail}
              disabled={disabled}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder="you@yourbusiness.co.uk"
              autoComplete="email"
              className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
          </label>

          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={resendInvitedMe}
              disabled={disabled}
              onChange={(e) => setResendInvitedMe(e.target.checked)}
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
          <p className="text-sm text-green-700" role="status">
            <strong>Done.</strong> Domain:{" "}
            <span className="font-mono">{domain || "(not set)"}</span>
            {needsResend && resendEmail && (
              <>
                {" "}
                · Resend:{" "}
                <span className="font-mono">{resendEmail}</span>
              </>
            )}
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

// ---------- Tiny helpers ----------

function modulesPretty(modules: string[]): string {
  const list: string[] = [];
  if (modules.includes("Enquiry Form")) list.push("Enquiry");
  if (modules.includes("Newsletter")) list.push("Newsletter");
  if (list.length === 0) return "Enquiry / Newsletter";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function prettySender(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return "";
  return `news@${trimmed}`;
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
        Role to pick: <strong>Admin</strong>
      </p>
    </div>
  );
}
