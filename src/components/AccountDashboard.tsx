"use client";

// Customer dashboard at /account/[token]. Read-mostly client
// component with one interactive piece: the change-request form
// (POST /api/account/change-request). Everything else is rendered
// from server-fetched Notion data passed as props.

import Link from "next/link";
import { useState } from "react";
import type { ChangeRequest } from "@/lib/notion-prospects";
import RAGStatus from "@/components/RAGStatus";
import { site } from "@/lib/site";

export type AccountDashboardProps = {
  token: string;
  name: string;
  business: string;
  status: string;
  /** Customer's domain if Step 2 captured one; empty string otherwise. */
  domain: string;
  modules: string[];
  setupFee: number;
  monthlyFee: number;
  foundingMember: boolean;
  onboardingCompletedAt: string | null;
  goLiveDate: string | null;
  changeRequests: ChangeRequest[];
};

// Friendly status labels + tones for the hero badge.
const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  Paid: {
    label: "Setup in progress",
    tone: "bg-blue-100 text-blue-800",
  },
  "Onboarding Started": {
    label: "Onboarding in progress",
    tone: "bg-purple-100 text-purple-800",
  },
  "Onboarding Complete": {
    label: "Build queued",
    tone: "bg-orange-100 text-orange-800",
  },
  "Build Started": {
    label: "Build in progress",
    tone: "bg-orange-100 text-orange-800",
  },
  Live: {
    label: "Live",
    tone: "bg-green-100 text-green-800",
  },
  Cancelled: {
    label: "Cancelled",
    tone: "bg-navy-100 text-navy-700",
  },
};

export default function AccountDashboard(props: AccountDashboardProps) {
  const {
    token,
    name,
    business,
    status,
    domain,
    modules,
    setupFee,
    monthlyFee,
    foundingMember,
    onboardingCompletedAt,
    goLiveDate,
    changeRequests,
  } = props;

  const firstName = (name.split(/\s+/)[0] ?? name).trim();
  const statusBadge = STATUS_LABEL[status] ?? {
    label: status,
    tone: "bg-navy-100 text-navy-700",
  };
  const isLive = status === "Live";
  const isCancelled = status === "Cancelled";
  const siteUrl = domain ? `https://${domain}` : "";
  const daysSinceLaunch = onboardingCompletedAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(onboardingCompletedAt).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  // Prior change requests, newest first (already sorted server-side by
  // appendChangeRequest helper).
  const [requests, setRequests] = useState<ChangeRequest[]>(changeRequests);

  return (
    <>
      <section className="bg-cream-100/60 pb-6 pt-12 md:pb-8 md:pt-16">
        <div className="container-content max-w-5xl">
          <span className="eyebrow">Your account</span>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h1 className="font-serif text-3xl font-semibold text-navy-900 md:text-4xl">
              Welcome back, {firstName}.
            </h1>
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusBadge.tone}`}
            >
              {statusBadge.label}
            </span>
          </div>
          {business && (
            <p className="mt-2 text-[1.05rem] text-navy-700">
              {business}
            </p>
          )}
          {isCancelled && (
            <div className="mt-5 rounded-2xl border-l-4 border-navy-300 bg-cream-100 p-5 text-sm leading-relaxed text-navy-700">
              <p className="font-semibold text-navy-900">
                This account has been cancelled.
              </p>
              <p className="mt-2">
                Your site keeps running on your own Cloudflare account.
                Your accounts on Resend, Cal.com and Google Business
                Profile are unaffected. This dashboard is read-only — if
                you want to come back, email me and I&apos;ll re-onboard
                you at the standard setup fee.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="pb-24 pt-6">
        <div className="container-content max-w-5xl">
          <div className="grid gap-6 md:grid-cols-2">
            {/* ---------- Your site ---------- */}
            <DashCard title="Your site">
              {siteUrl ? (
                <>
                  <p className="font-mono text-base text-navy-900">
                    <a
                      href={siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link"
                    >
                      {domain}
                    </a>
                  </p>
                  {isLive && daysSinceLaunch !== null && (
                    <p className="mt-2 text-sm text-navy-600">
                      Live for {daysSinceLaunch}{" "}
                      {daysSinceLaunch === 1 ? "day" : "days"}.
                    </p>
                  )}
                  {!isLive && (
                    <p className="mt-2 text-sm text-navy-600">
                      {status === "Build Started"
                        ? "Your site is being built. I'll email you when the preview is ready."
                        : status === "Onboarding Complete"
                          ? "Onboarding complete — your build is queued."
                          : "Setup in progress — finish your Onboarding Hub steps to unlock the build."}
                    </p>
                  )}
                  {goLiveDate && !isLive && (
                    <p className="mt-2 text-sm text-navy-600">
                      Target go-live:{" "}
                      <strong className="text-navy-900">
                        {formatDate(goLiveDate)}
                      </strong>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-navy-700">
                  Your domain hasn&apos;t been captured yet.{" "}
                  <Link
                    href={`/onboarding/${token}`}
                    className="link"
                  >
                    Finish your onboarding
                  </Link>{" "}
                  to add it.
                </p>
              )}
              {!isCancelled && (
                <Link
                  href={`/onboarding/${token}`}
                  className="mt-4 inline-block text-sm font-semibold text-ember-600 transition-colors hover:text-ember-700"
                >
                  Open your Onboarding Hub →
                </Link>
              )}
            </DashCard>

            {/* ---------- Subscription ---------- */}
            <DashCard title="Your subscription">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-navy-600">Setup fee (one-off)</dt>
                <dd className="font-semibold text-navy-900">
                  £{setupFee}
                </dd>
                <dt className="text-navy-600">Monthly fee</dt>
                <dd className="font-semibold text-navy-900">
                  £{monthlyFee}/mo
                  {foundingMember && (
                    <span className="ml-2 inline-block rounded-full bg-ember-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ember-700">
                      Founding rate
                    </span>
                  )}
                </dd>
                <dt className="text-navy-600">Modules</dt>
                <dd className="text-navy-900">
                  <ul className="list-disc pl-4">
                    <li>Base website</li>
                    {modules.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </dd>
              </dl>
              <p className="mt-4 text-xs text-navy-500">
                Want to add or remove a module?{" "}
                <a
                  href={`mailto:${site.contactEmail}?subject=Module%20change%20-%20${encodeURIComponent(business || name)}`}
                  className="link"
                >
                  Email me
                </a>
                {" "}and I&apos;ll sort it out.
              </p>
            </DashCard>

            {/* ---------- This month ---------- */}
            <DashCard title="This month">
              <p className="text-sm text-navy-700">
                30 minutes of content changes are included every month.
              </p>
              <div className="mt-4 rounded-xl bg-cream-50 p-4">
                <p className="text-xs uppercase tracking-wider text-navy-500">
                  Allowance used
                </p>
                <p className="mt-1 font-serif text-2xl font-semibold text-navy-900">
                  0 / 30 min
                </p>
                <p className="mt-1 text-xs text-navy-500">
                  Detailed tracking arrives with the monthly performance
                  report.
                </p>
              </div>
            </DashCard>

            {/* ---------- Get in touch ---------- */}
            <DashCard title="Get in touch">
              <p className="text-sm text-navy-700">
                Quickest way to reach me about anything that doesn&apos;t
                fit a change request.
              </p>
              <a
                href={`mailto:${site.contactEmail}`}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-700"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M3 7 L12 13 L21 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                {site.contactEmail}
              </a>
              <p className="mt-4 text-xs text-navy-500">
                Want to cancel?{" "}
                <a
                  href={`mailto:${site.contactEmail}?subject=Cancellation%20-%20${encodeURIComponent(business || name)}`}
                  className="link"
                >
                  Email me with &ldquo;Cancellation&rdquo; in the
                  subject
                </a>{" "}
                and I&apos;ll start the 30-day notice straight away.
              </p>
            </DashCard>
          </div>

          {/* ---------- Change requests (full width) ---------- */}
          {!isCancelled && (
            <div className="mt-8">
              <ChangeRequestsBlock
                token={token}
                requests={requests}
                onSubmitted={(req) => setRequests((prev) => [req, ...prev])}
              />
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ---------- Card primitive ----------

function DashCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl bg-white p-6 shadow-card md:p-7">
      <h2 className="font-serif text-xl font-semibold text-navy-900">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </article>
  );
}

// ---------- Change requests ----------

function ChangeRequestsBlock({
  token,
  requests,
  onSubmitted,
}: {
  token: string;
  requests: ChangeRequest[];
  onSubmitted: (req: ChangeRequest) => void;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setError("Please describe the change in at least a few words.");
      return;
    }
    if (trimmed.length > 5000) {
      setError("That's a lot for one message — please split it up.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/account/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: trimmed }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        request?: ChangeRequest;
        error?: string;
      };
      if (!res.ok || !json.success || !json.request) {
        setError(json.error ?? "Couldn't submit just now. Try again.");
        return;
      }
      onSubmitted(json.request);
      setMessage("");
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-2xl bg-white p-7 shadow-card md:p-8">
      <h2 className="font-serif text-xl font-semibold text-navy-900">
        Need a change?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-navy-700">
        Tell me what you&apos;d like updated — a phone number, a new
        photo, a price tweak, a fresh testimonial. The first 30 minutes
        of changes each month are included in your monthly fee. I&apos;ll
        come back within 48 working hours.
      </p>

      <div className="mt-5">
        <label className="block">
          <span className="block text-sm font-semibold text-navy-900">
            What would you like changed?
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={pending}
            placeholder="e.g. Please update my phone number on the contact page from 01865 111 222 to 01865 333 444. Also swap the second photo on the gallery for the one I emailed last week (subject: 'New van photo')."
            rows={5}
            maxLength={5000}
            className="mt-2 w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </label>

        {error && (
          <p className="mt-3 text-sm text-ember-700" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-3 text-sm text-green-700" role="status">
            <strong>Got it.</strong> I&apos;ll come back within 48
            working hours. You&apos;ll see this request in your history
            below.
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || message.trim().length === 0}
          className="btn-primary mt-4"
        >
          {pending ? "Submitting…" : "Submit request"}
        </button>
      </div>

      {requests.length > 0 && (
        <div className="mt-7 border-t border-navy-100 pt-6">
          <h3 className="font-serif text-base font-semibold text-navy-900">
            Your requests
          </h3>
          <ul className="mt-3 space-y-3">
            {requests.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-navy-100 bg-cream-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-wider text-navy-500">
                    {formatRelativeDate(r.submittedAt)}
                  </span>
                  <RAGStatus status={r.status} />
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-navy-800">
                  {r.message}
                </p>
                {r.reply && (
                  <div className="mt-3 rounded-lg border-l-2 border-green-500 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
                      Reply from ModuForge
                      {r.resolvedAt && (
                        <>
                          {" · "}
                          {formatRelativeDate(r.resolvedAt)}
                        </>
                      )}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-navy-800">
                      {r.reply}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatRelativeDate(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMin = Math.floor((now - then) / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
