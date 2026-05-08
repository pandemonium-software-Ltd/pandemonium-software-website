// RAG (Red / Amber / Green) traffic-light pill for ChangeRequest
// status. Used on both the customer dashboard and the operator
// detail page so the same status looks identical in both places.
//
//   pending     → Red    (received, not yet started)
//   in-progress → Amber  (being worked on)
//   resolved    → Green  (done, customer was emailed)
//   rejected    → Grey   (closed without action; reply explains why)

import type { ChangeRequest } from "@/lib/notion-prospects";

const LABEL: Record<ChangeRequest["status"], string> = {
  pending: "Pending",
  "in-progress": "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

const TONE: Record<
  ChangeRequest["status"],
  { dot: string; pill: string }
> = {
  pending: {
    dot: "bg-red-500",
    pill: "bg-red-100 text-red-800",
  },
  "in-progress": {
    dot: "bg-orange-500",
    pill: "bg-orange-100 text-orange-800",
  },
  resolved: {
    dot: "bg-green-500",
    pill: "bg-green-100 text-green-800",
  },
  rejected: {
    dot: "bg-navy-400",
    pill: "bg-navy-100 text-navy-700",
  },
};

export default function RAGStatus({
  status,
}: {
  status: ChangeRequest["status"];
}) {
  const t = TONE[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${t.pill}`}
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${t.dot}`}
      />
      {LABEL[status]}
    </span>
  );
}
