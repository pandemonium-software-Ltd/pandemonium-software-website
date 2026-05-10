"use client";

// Customer dashboard at /account/[token]. Read-mostly client
// component with one interactive piece: the change-request form
// (POST /api/account/change-request). Everything else is rendered
// from server-fetched Notion data passed as props.

import Link from "next/link";
import { useRef, useState } from "react";
import {
  countActiveChangeRequestsThisMonth,
  MONTHLY_CHANGE_REQUEST_LIMIT,
  type ChangeRequest,
} from "@/lib/notion-prospects";
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
                {MONTHLY_CHANGE_REQUEST_LIMIT} change requests are
                included every month — content edits, photo swaps,
                price updates, anything in scope. One item per
                request.
              </p>
              <div className="mt-4 rounded-xl bg-cream-50 p-4">
                <p className="text-xs uppercase tracking-wider text-navy-500">
                  Used this month
                </p>
                <p className="mt-1 font-serif text-2xl font-semibold text-navy-900">
                  {countActiveChangeRequestsThisMonth(requests)} /{" "}
                  {MONTHLY_CHANGE_REQUEST_LIMIT}
                </p>
                <p className="mt-1 text-xs text-navy-500">
                  Resets on the 1st of next month. Out-of-scope items
                  quoted separately don&apos;t count.
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
                onRetracted={(id) =>
                  setRequests((prev) =>
                    prev.map((r) =>
                      r.id === id
                        ? { ...r, status: "retracted", resolvedAt: new Date().toISOString() }
                        : r,
                    ),
                  )
                }
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
  onRetracted,
}: {
  token: string;
  requests: ChangeRequest[];
  onSubmitted: (req: ChangeRequest) => void;
  onRetracted: (id: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Submission confirmation dialog (native <dialog> for built-in
  // modal behaviour, ESC handling and focus trap).
  const submitDialogRef = useRef<HTMLDialogElement | null>(null);

  // Retract confirmation dialog. We track which request is being
  // retracted in state — the dialog shows that request's preview
  // alongside the confirm action.
  const retractDialogRef = useRef<HTMLDialogElement | null>(null);
  const [retractTarget, setRetractTarget] = useState<ChangeRequest | null>(
    null,
  );
  const [retracting, setRetracting] = useState(false);

  const usedThisMonth = countActiveChangeRequestsThisMonth(requests);
  const remaining = Math.max(
    0,
    MONTHLY_CHANGE_REQUEST_LIMIT - usedThisMonth,
  );
  const atCap = remaining === 0;

  /**
   * "Submit request" button — runs client-side length validation
   * then opens the confirmation dialog. Server-side validation
   * (multi-item detector + monthly cap) fires inside `confirmSubmit`
   * after the customer hits Yes in the dialog.
   */
  function handleSubmitClick() {
    setError(null);
    setSuccess(null);
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setError("Please describe the change in at least a few words.");
      return;
    }
    if (trimmed.length > 5000) {
      setError("That's a lot for one message — please split it up.");
      return;
    }
    submitDialogRef.current?.showModal();
  }

  /** Yes-confirm in the submit dialog → fires the API call. */
  async function confirmSubmit() {
    const trimmed = message.trim();
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
        remaining?: number;
        error?: string;
        suggestion?: string;
      };
      submitDialogRef.current?.close();
      if (!res.ok || !json.success || !json.request) {
        setError(json.error ?? "Couldn't submit just now. Try again.");
        return;
      }
      onSubmitted(json.request);
      setMessage("");
      const remainingAfter = json.remaining ?? remaining - 1;
      setSuccess(
        `Got it. ${remainingAfter} request${remainingAfter === 1 ? "" : "s"} remaining this month. You can retract it from the list below any time before I start working on it.`,
      );
      setTimeout(() => setSuccess(null), 10000);
    } catch (e) {
      submitDialogRef.current?.close();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  /** Open the retract confirmation dialog for a specific request. */
  function startRetract(r: ChangeRequest) {
    setError(null);
    setSuccess(null);
    setRetractTarget(r);
    retractDialogRef.current?.showModal();
  }

  /** Yes-confirm in the retract dialog → fires DELETE. */
  async function confirmRetract() {
    if (!retractTarget) return;
    setRetracting(true);
    try {
      const res = await fetch("/api/account/change-request", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, requestId: retractTarget.id }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      retractDialogRef.current?.close();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Couldn't retract just now. Try again.");
        return;
      }
      onRetracted(retractTarget.id);
      setSuccess(
        "Retracted. That slot's back in your monthly allowance.",
      );
      setTimeout(() => setSuccess(null), 8000);
    } catch (e) {
      retractDialogRef.current?.close();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetracting(false);
      setRetractTarget(null);
    }
  }

  return (
    <article className="rounded-2xl bg-white p-7 shadow-card md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold text-navy-900">
          Need a change?
        </h2>
        <span
          className={[
            "rounded-full px-3 py-1 text-xs font-semibold",
            atCap
              ? "bg-navy-900 text-white"
              : remaining === 1
                ? "bg-ember-100 text-ember-800 ring-1 ring-ember-200"
                : "bg-cream-100 text-navy-800 ring-1 ring-navy-200",
          ].join(" ")}
        >
          {usedThisMonth} of {MONTHLY_CHANGE_REQUEST_LIMIT} used
          this month
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-navy-700">
        Tell me what you&apos;d like updated — a phone number, a new
        photo, a price tweak, a fresh testimonial. You get{" "}
        <strong>
          {MONTHLY_CHANGE_REQUEST_LIMIT} change requests included
          every month
        </strong>
        , and each one needs to be a single item. I&apos;ll come back
        within 48 working hours.
      </p>

      {/* One-item rule callout */}
      <div className="mt-4 rounded-xl border-2 border-navy-100 bg-cream-50 p-4 text-xs leading-relaxed text-navy-700">
        <p className="font-semibold text-navy-900">
          One item per request
        </p>
        <p className="mt-1">
          If you need three things changed, send three separate
          requests. It keeps each change clean to track and apply.
          Multi-item submissions (numbered lists, &ldquo;Also,&rdquo;
          paragraphs, etc.) are auto-declined and you&apos;ll be asked
          to split them — that doesn&apos;t burn a request.
        </p>
      </div>

      {atCap ? (
        <div className="mt-5 rounded-xl border-2 border-navy-200 bg-cream-50 p-5 text-sm leading-relaxed text-navy-700">
          <p className="font-semibold text-navy-900">
            All {MONTHLY_CHANGE_REQUEST_LIMIT} requests used this
            month.
          </p>
          <p className="mt-2">
            Allowance resets on the 1st of next month. For anything
            urgent or bigger,{" "}
            <a
              href={`mailto:${site.contactEmail}`}
              className="link"
            >
              email me directly
            </a>{" "}
            and I&apos;ll quote it separately.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <label className="block">
            <span className="block text-sm font-semibold text-navy-900">
              What would you like changed? (one item)
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={pending}
              placeholder="e.g. Please update my phone number on the contact page from 01865 111 222 to 01865 333 444 — we just got a new line."
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
              {success}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmitClick}
            disabled={pending || message.trim().length === 0}
            className="btn-primary mt-4"
          >
            {pending ? "Submitting…" : "Submit request"}
          </button>
        </div>
      )}

      {requests.length > 0 && (
        <div className="mt-7 border-t border-navy-100 pt-6">
          <h3 className="font-serif text-base font-semibold text-navy-900">
            Your requests
          </h3>
          <ul className="mt-3 space-y-3">
            {requests.map((r) => (
              <li
                key={r.id}
                className={[
                  "rounded-xl border border-navy-100 p-4",
                  r.status === "retracted"
                    ? "bg-cream-100 opacity-75"
                    : "bg-cream-50",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-wider text-navy-500">
                    {formatRelativeDate(r.submittedAt)}
                  </span>
                  <RAGStatus status={r.status} />
                </div>
                <p
                  className={[
                    "mt-2 whitespace-pre-wrap text-sm text-navy-800",
                    r.status === "retracted" ? "line-through opacity-70" : "",
                  ].join(" ")}
                >
                  {r.message}
                </p>
                {/* Preview-pending banner — Cowork has auto-applied
                    + built a preview, customer needs to approve to
                    promote to live. The email is the primary CTA;
                    this in-dashboard prompt is the safety net for
                    customers who miss the email. */}
                {r.status === "in-progress" &&
                  r.previewVersionUrl &&
                  !r.customerApprovedAt &&
                  !r.customerRejectedAt && (
                    <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-900">
                        Preview ready — your approval needed
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        I built a preview of your change. Have a look,
                        then approve to publish OR reject if it&apos;s
                        not right. Your live site is unchanged until
                        you approve.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={r.previewVersionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border-2 border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:border-amber-400"
                        >
                          Open preview ↗
                        </a>
                        {r.customerApprovalToken && (
                          <>
                            <a
                              href={`/account/${token}/approve-change/${r.id}?t=${r.customerApprovalToken}`}
                              className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                            >
                              Approve & publish
                            </a>
                            <a
                              href={`/account/${token}/reject-change/${r.id}?t=${r.customerApprovalToken}`}
                              className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:border-red-400"
                            >
                              Reject
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                {/* Just-promoted confirmation — surfaces after the
                    customer clicks Approve and the promote workflow
                    succeeds (build-callback flips status=resolved). */}
                {r.customerApprovedAt && r.status === "resolved" && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                    ✓ Approved + live
                  </p>
                )}
                {r.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => startRetract(r)}
                    disabled={retracting}
                    className="mt-3 inline-flex items-center gap-1 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-semibold text-navy-700 transition-colors hover:border-ember-400 hover:text-ember-700 disabled:opacity-60"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 5l14 14M19 5L5 19"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    Retract this request
                  </button>
                )}
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

      {/* ---------- Submit confirmation dialog ---------- */}
      <dialog
        ref={submitDialogRef}
        className="m-auto max-w-md rounded-2xl border-0 p-0 shadow-lift backdrop:bg-navy-900/50"
        onClose={() => {
          // No-op; native ESC / backdrop-click closes cleanly. We
          // don't fire the API on close, only on Yes-confirm.
        }}
      >
        <div className="p-6 md:p-7">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Confirm your request
          </h2>
          <p className="mt-2 text-sm text-navy-700">
            This will use <strong>1 of your {remaining} remaining</strong>{" "}
            {remaining === 1 ? "request" : "requests"} this month.
          </p>

          <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-navy-100 bg-cream-50 p-4 text-sm whitespace-pre-wrap text-navy-800">
            {message.trim() || "(empty)"}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-navy-600">
            Once submitted, you can retract this request from the list
            below any time before I start working on it. Multi-item
            submissions are auto-declined and don&apos;t burn a slot.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => submitDialogRef.current?.close()}
              disabled={pending}
              className="rounded-lg border-2 border-navy-200 px-4 py-2 text-sm font-semibold text-navy-900 transition-colors hover:border-navy-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSubmit}
              disabled={pending}
              className="btn-primary"
            >
              {pending ? "Submitting…" : "Yes, submit"}
            </button>
          </div>
        </div>
      </dialog>

      {/* ---------- Retract confirmation dialog ---------- */}
      <dialog
        ref={retractDialogRef}
        className="m-auto max-w-md rounded-2xl border-0 p-0 shadow-lift backdrop:bg-navy-900/50"
        onClose={() => setRetractTarget(null)}
      >
        <div className="p-6 md:p-7">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Retract this request?
          </h2>
          <p className="mt-2 text-sm text-navy-700">
            You can only retract before I start working on it. The
            slot goes back into your monthly allowance.
          </p>

          {retractTarget && (
            <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-navy-100 bg-cream-50 p-4 text-sm whitespace-pre-wrap text-navy-800">
              {retractTarget.message}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => retractDialogRef.current?.close()}
              disabled={retracting}
              className="rounded-lg border-2 border-navy-200 px-4 py-2 text-sm font-semibold text-navy-900 transition-colors hover:border-navy-400"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={confirmRetract}
              disabled={retracting}
              className="rounded-lg bg-ember-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ember-700 disabled:opacity-60"
            >
              {retracting ? "Retracting…" : "Yes, retract"}
            </button>
          </div>
        </div>
      </dialog>
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
