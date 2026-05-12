"use client";

// Per-review-edit operator action panel for /admin/[token].
// Mirrors ChangeRequestEditor but for the pre-commit (Hub Step 5)
// review-edit inbox. Two actions:
//   - approve: flips status to "applied" + dispatches a fresh
//     LIVE build to deploy whatever's currently in Notion. The
//     customer gets the review-edit-applied email when the build
//     callback fires.
//   - reject: flips status to "rejected" + emails the customer
//     using the change-request-rejected template (operator's
//     reply included verbatim). Customer's allowance increments
//     back since the edit didn't consume a slot.

import { useState } from "react";
import DictatePatchPanel from "@/components/admin/DictatePatchPanel";

type CoworkPatchView = {
  target: string;
  newValue?: unknown;
  previousValue?: unknown;
  serviceName?: string;
  faqQuestion?: string;
};

type ReviewEditView = {
  id: string;
  message: string;
  status: "submitted" | "applied" | "rejected";
  resolvedAt?: string;
  adminReply?: string;
  coworkClassification?: "in_scope" | "out_of_scope" | "ambiguous";
  coworkConfidence?: number;
  coworkReasoning?: string;
  /** New multi-patch shape. */
  coworkPatches?: CoworkPatchView[];
  /** @deprecated — legacy single-patch shape. UI normalises into
   *  `coworkPatches` when reading. */
  coworkPatch?: CoworkPatchView;
  coworkPatchAppliedAt?: string;
  coworkEscalatedAt?: string;
};

type Props = {
  token: string;
  edit: ReviewEditView;
};

export default function ReviewEditEditor({ token, edit }: Props) {
  const [current, setCurrent] = useState(edit);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState<"none" | "approve" | "reject">("none");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Normalise legacy single-patch into the new array shape so the
  // rest of the UI only deals with one form.
  const patches: CoworkPatchView[] =
    current.coworkPatches && current.coworkPatches.length > 0
      ? current.coworkPatches
      : current.coworkPatch
        ? [current.coworkPatch]
        : [];
  // When Cowork classified but proposed NO patches (vague request,
  // mixed scope, or unsupported targets), approving alone won't
  // change the live site — Notion has unedited data. Force operator
  // to confirm they've already done the manual edit.
  const escalatedNoPatch =
    !!current.coworkClassification &&
    patches.length === 0 &&
    !current.coworkPatchAppliedAt;
  const [confirmedManualEdit, setConfirmedManualEdit] = useState(false);

  const isClosed = current.status !== "submitted";

  async function submit(action: "approve" | "reject") {
    if (action === "reject" && !reply.trim()) {
      setError(
        "Add a reply explaining why — that's what the customer sees on their dashboard.",
      );
      return;
    }
    if (action === "approve" && escalatedNoPatch && !confirmedManualEdit) {
      const isOutOfScope = current.coworkClassification === "out_of_scope";
      const looksLikeAsset =
        /\b(logo|photo|image|picture|hero|banner|header|gallery|headshot)\b/i.test(
          current.message,
        );
      // Asset-shaped out_of_scope: don't force the checkbox — the
      // build itself may pick up a new asset upload even though
      // the text classifier said out_of_scope. Let the operator
      // approve and rely on the build to do the right thing.
      if (isOutOfScope && looksLikeAsset) {
        // No-op — allow approve without confirmation. The warning
        // above explains the trade-off.
      } else {
        setError(
          isOutOfScope
            ? "Cowork said this is out-of-scope. Tick the confirmation below if you've handled it manually."
            : "Cowork didn't auto-apply this. Tick the confirmation below — otherwise the deploy will look unchanged because Notion still has the old data.",
        );
        return;
      }
    }
    setError(null);
    setSuccess(null);
    setPending(action);
    try {
      const res = await fetch("/api/admin/review-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          editId: current.id,
          action,
          reply: reply.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        action?: "approve" | "reject";
        build?: { dispatched: true } | { dispatched: false; reason: string } | null;
        customerNotified?: boolean | null;
        emailWarning?: string | null;
        error?: string;
        inlineApply?: {
          appliedPatchCount: number;
          appliedTargets: string[];
          classification?: "in_scope" | "out_of_scope" | "ambiguous";
          confidence?: number;
          skippedReason?: string;
        } | null;
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Save failed. Try again.");
        return;
      }
      setCurrent((c) => ({
        ...c,
        status: action === "approve" ? "applied" : "rejected",
        resolvedAt: new Date().toISOString(),
        adminReply: reply.trim() || c.adminReply,
      }));
      const parts: string[] = [`${action === "approve" ? "Approved" : "Rejected"}.`];
      if (action === "approve") {
        // Surface inline-classify result FIRST so operator knows
        // whether anything actually changed in Notion before the
        // build runs.
        if (json.inlineApply) {
          if (json.inlineApply.appliedPatchCount > 0) {
            parts.push(
              `Cowork inline-applied ${json.inlineApply.appliedPatchCount} patch${json.inlineApply.appliedPatchCount === 1 ? "" : "es"}: ${json.inlineApply.appliedTargets.join(", ")}.`,
            );
          } else if (
            json.inlineApply.appliedPatchCount === 0 &&
            !json.inlineApply.skippedReason
          ) {
            // Rebuild-only success (asset refresh).
            parts.push(
              `Cowork classified as rebuild-only (asset refresh). No patches needed — build will ship the latest assets.`,
            );
          } else if (json.inlineApply.skippedReason) {
            parts.push(`⚠️ ${json.inlineApply.skippedReason}`);
          }
        }
        if (json.build?.dispatched) {
          parts.push("Build dispatched — customer email lands when it completes.");
        } else if (json.build && !json.build.dispatched) {
          parts.push(`Build skipped: ${json.build.reason}`);
        }
      } else {
        if (json.customerNotified) parts.push("Customer emailed.");
        else if (json.emailWarning) parts.push(`Email FAILED (${json.emailWarning}).`);
      }
      setSuccess(parts.join(" "));
      // Bump display time when we have inline-apply detail to read.
      setTimeout(() => setSuccess(null), json.inlineApply ? 14000 : 8000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending("none");
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Cowork's analysis */}
      {(current.coworkClassification ||
        current.coworkReasoning ||
        patches.length > 0) && (
        <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 text-xs">
          <p className="font-semibold uppercase tracking-wider text-amber-900">
            Cowork&apos;s take
            {current.coworkConfidence !== undefined && (
              <span className="ml-2 font-mono text-[10px]">
                ({current.coworkClassification},{" "}
                {(current.coworkConfidence * 100).toFixed(0)}% confidence)
              </span>
            )}
          </p>
          {current.coworkReasoning && (
            <p className="mt-1.5 text-amber-900">{current.coworkReasoning}</p>
          )}
          {patches.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {patches.map((p, i) => (
                <div
                  key={`${p.target}-${i}`}
                  className="rounded border border-amber-200 bg-white p-2 font-mono text-[11px] text-navy-800"
                >
                  {patches.length > 1 && (
                    <p className="text-[10px] font-semibold text-amber-700">
                      Patch {i + 1} of {patches.length}
                    </p>
                  )}
                  <p>
                    <strong>Target:</strong> {p.target}
                  </p>
                  <p className="mt-0.5">
                    <strong>New value:</strong>{" "}
                    <span className="break-all">{String(p.newValue)}</span>
                  </p>
                  {p.previousValue !== undefined && (
                    <p className="mt-0.5">
                      <strong>Was:</strong>{" "}
                      <span className="break-all">
                        {String(p.previousValue) || "(empty)"}
                      </span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {current.coworkPatchAppliedAt && (
            <p className="mt-1.5 text-amber-900">
              ✓ {patches.length > 1
                ? `${patches.length} patches applied`
                : "Patch applied"}{" "}
              to Notion{" "}
              <span className="text-[10px]">
                {new Date(current.coworkPatchAppliedAt).toLocaleString()}
              </span>
              . Approve below to dispatch the deploy.
            </p>
          )}
        </div>
      )}

      {isClosed ? (
        <div className="rounded-lg border border-navy-100 bg-cream-50 p-3 text-sm">
          <p className="font-semibold text-navy-900">
            {current.status === "applied" ? "Approved ✓" : "Rejected"}
            {current.resolvedAt && (
              <span className="ml-2 text-xs font-normal text-navy-500">
                {new Date(current.resolvedAt).toLocaleString()}
              </span>
            )}
          </p>
          {current.adminReply && (
            <p className="mt-1.5 whitespace-pre-wrap text-navy-700">
              {current.adminReply}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {escalatedNoPatch && (() => {
            // Tailor the warning to what Cowork actually said —
            // out_of_scope and ambiguous have different action paths.
            // (rebuildOnly cases don't hit this branch because they
            // stamp coworkPatchAppliedAt.)
            const c = current.coworkClassification;
            const looksLikeAsset =
              /\b(logo|photo|image|picture|hero|banner|header|gallery|headshot)\b/i.test(
                current.message,
              );
            const isOutOfScope = c === "out_of_scope";
            const isAmbiguous = c === "ambiguous";

            // Asset-shaped but classifier said out_of_scope:
            // probably a stale classification (classifier was running
            // pre-asset-support deploy). Hint at that.
            if (isOutOfScope && looksLikeAsset) {
              return (
                <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 text-xs">
                  <p className="font-semibold text-amber-900">
                    ⚠️ This looks like an asset refresh, but Cowork said
                    out-of-scope
                  </p>
                  <p className="mt-1 text-amber-900">
                    The customer mentioned a visual asset (logo / photo / hero
                    etc.) but Cowork classified this as out_of_scope. Likely
                    causes:
                  </p>
                  <ul className="ml-4 mt-1.5 list-disc text-amber-900 space-y-0.5">
                    <li>
                      Classifier ran before the asset-refresh prompt was
                      deployed — re-classify by clearing the cowork audit
                      and waiting for the next cron tick.
                    </li>
                    <li>
                      The customer didn&apos;t actually upload a new asset
                      yet, so the snapshot has nothing recent — check Hub
                      Step 4.
                    </li>
                  </ul>
                  <p className="mt-1.5 text-amber-900">
                    Approving will dispatch a build with current data. If they
                    DID upload, that&apos;s fine — the build picks up the new
                    asset. If they didn&apos;t, the live site won&apos;t
                    change.
                  </p>
                </div>
              );
            }

            if (isOutOfScope) {
              return (
                <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 text-xs">
                  <p className="font-semibold text-amber-900">
                    ⚠️ Cowork classified this as out-of-scope
                  </p>
                  <p className="mt-1 text-amber-900">
                    This request isn&apos;t something the automation can
                    handle (e.g. structural / design / new-page change). If
                    you approve, you&apos;ll need to handle it manually —
                    update Notion or whichever system is relevant, then tick:
                  </p>
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-amber-900">
                    <input
                      type="checkbox"
                      checked={confirmedManualEdit}
                      onChange={(e) => setConfirmedManualEdit(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-amber-400"
                    />
                    <span>
                      I&apos;ve handled this manually. Approve &amp; deploy
                      anyway.
                    </span>
                  </label>
                </div>
              );
            }

            // Ambiguous / multi-field / no clear scope — original copy.
            return (
              <div className="rounded-lg border-l-4 border-red-400 bg-red-50 p-3 text-xs">
                <p className="font-semibold text-red-900">
                  ⚠️ Cowork didn&apos;t auto-apply this
                </p>
                <p className="mt-1 text-red-900">
                  {isAmbiguous
                    ? "Cowork found the request ambiguous (vague / mixed-scope / missing data). "
                    : "Cowork escalated without patches. "}
                  If you click Approve now, the build will deploy unchanged
                  data and the customer&apos;s request won&apos;t appear on
                  the live site.
                </p>
                <p className="mt-1.5 text-red-900">
                  Open Notion → Prospects → this customer → make the requested
                  change(s) by hand, then come back and tick:
                </p>
                <label className="mt-2 flex cursor-pointer items-start gap-2 text-red-900">
                  <input
                    type="checkbox"
                    checked={confirmedManualEdit}
                    onChange={(e) => setConfirmedManualEdit(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-red-400"
                  />
                  <span>
                    I&apos;ve already made the change in Notion. Approve &amp;
                    deploy.
                  </span>
                </label>
              </div>
            );
          })()}
          {escalatedNoPatch && (
            <DictatePatchPanel token={token} editId={current.id} />
          )}
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to the customer (required for reject; optional for approve)…"
            rows={3}
            disabled={pending !== "none"}
            className="w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => submit("approve")}
              disabled={pending !== "none"}
              className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {pending === "approve"
                ? "Approving…"
                : current.coworkPatchAppliedAt
                  ? "Approve & deploy"
                  : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => submit("reject")}
              disabled={pending !== "none"}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-300 bg-white px-4 py-1.5 text-xs font-semibold text-red-800 hover:border-red-400 disabled:opacity-50"
            >
              {pending === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
        </div>
      )}

      {success && (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-800"
        >
          {success}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-ember-200 bg-ember-50 p-2 text-xs text-ember-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
