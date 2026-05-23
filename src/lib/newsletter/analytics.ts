// Newsletter analytics aggregation.
//
// Combines two data sources into the shape the dashboard's
// Newsletter tab renders:
//   - Send history (on the prospect's onboardingData) — sends
//     themselves: when, subject, recipient count, status.
//   - newsletter_events D1 table — Resend webhook callbacks for
//     each (resend_email_id, event_type) we've received.
//
// For each send we tally delivered / opened / clicked / bounced /
// complained event counts, then derive rates as
//   open_rate = unique_opens / delivered_count
// Resend fires opens repeatedly but the PK on (resend_email_id,
// event_type) collapses duplicates, so the SQL count is unique.
//
// Subscriber growth: derived from the prospect's
// onboardingData.content.newsletter.subscribers[].confirmedAt
// timestamps — no D1 needed, the dashboard does the bucketing
// client-side from the raw list.

import type { D1Database } from "../d1-analytics";

export type SendStats = {
  /** Internal send id (matches history[].id and the webhook tag). */
  sendId: string;
  /** ISO timestamp Resend was told to send. */
  sentAt: string;
  /** Subject line the customer chose. */
  subject: string;
  /** Total recipients we attempted (i.e. queued into Resend). */
  recipientCount: number;
  /** Counts from the event stream. */
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
};

export type NewsletterAnalyticsWindow = {
  windowDays: number;
  /** Newest-first list of sends in the window (or all sends if
   *  fewer than the window). */
  sends: SendStats[];
  /** Totals across the window for the headline tiles. */
  totals: {
    sendsCount: number;
    recipientCount: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
  };
  /** Confirmed-subscriber count at the END of the window (i.e.
   *  current). Plus daily delta vs the start of the window. */
  subscriberCountNow: number;
  subscriberGrowthInWindow: number;
};

type HistoryEntry = {
  id: string;
  sentAt: string;
  subject: string;
  recipientCount: number;
  status: string;
};

type SubscriberRecord = {
  confirmedAt?: string;
  unsubscribedAt?: string;
};

/** Read a newsletter analytics window for one customer.
 *
 * `history` and `subscribers` come from the caller (they're on the
 * prospect record we already have in hand). `db` is the analytics
 * D1 binding the route fetches via getCloudflareContext(). */
export async function readNewsletterAnalytics(args: {
  db: D1Database;
  token: string;
  history: HistoryEntry[];
  subscribers: SubscriberRecord[];
  windowDays: number;
}): Promise<NewsletterAnalyticsWindow> {
  const { db, token, history, subscribers, windowDays } = args;

  // Filter history to the window. Sends are stamped with sentAt
  // ISO strings; compare against (now - windowDays).
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const cutoffIso = cutoff.toISOString();
  const sendsInWindow = history.filter((h) => h.sentAt >= cutoffIso);

  // Pull every event for this customer in one query — much cheaper
  // than N round trips. Filter to the sends in the window
  // client-side (we want to count events that fired DURING the
  // window even if the send itself was older — but for the v1
  // dashboard we report events grouped by their send, so a send
  // outside the window contributes nothing to the totals).
  const sendIds = sendsInWindow.map((s) => s.id);
  let rows: Array<{ send_id: string; event_type: string; cnt: number }> = [];
  if (sendIds.length > 0) {
    const placeholders = sendIds.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT send_id, event_type, COUNT(*) AS cnt
           FROM newsletter_events
          WHERE token = ? AND send_id IN (${placeholders})
          GROUP BY send_id, event_type`,
      )
      .bind(token, ...sendIds)
      .all<{ send_id: string; event_type: string; cnt: number }>();
    rows = results;
  }

  // Bucket events by (send_id, event_type) for O(1) lookup.
  const byKey = new Map<string, number>();
  for (const r of rows) {
    byKey.set(`${r.send_id}|${r.event_type}`, r.cnt);
  }
  const eventCount = (sendId: string, type: string): number =>
    byKey.get(`${sendId}|${type}`) ?? 0;

  // Build per-send stats. Sort newest first for the table.
  const sends: SendStats[] = sendsInWindow
    .slice()
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .map((h) => ({
      sendId: h.id,
      sentAt: h.sentAt,
      subject: h.subject,
      recipientCount: h.recipientCount,
      delivered: eventCount(h.id, "delivered"),
      opened: eventCount(h.id, "opened"),
      clicked: eventCount(h.id, "clicked"),
      bounced: eventCount(h.id, "bounced"),
      complained: eventCount(h.id, "complained"),
      unsubscribed: eventCount(h.id, "unsubscribed"),
    }));

  // Window totals.
  const totals = sends.reduce(
    (acc, s) => ({
      sendsCount: acc.sendsCount + 1,
      recipientCount: acc.recipientCount + s.recipientCount,
      delivered: acc.delivered + s.delivered,
      opened: acc.opened + s.opened,
      clicked: acc.clicked + s.clicked,
      bounced: acc.bounced + s.bounced,
      unsubscribed: acc.unsubscribed + s.unsubscribed,
    }),
    {
      sendsCount: 0,
      recipientCount: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
    },
  );

  // Subscriber growth: count confirmed-and-not-unsubscribed at
  // the start of the window vs now. (Unsub'd subscribers count
  // as "lost" — same as the dashboard's running count.)
  const isActive = (s: SubscriberRecord, asOf: string): boolean =>
    !!s.confirmedAt &&
    s.confirmedAt <= asOf &&
    (!s.unsubscribedAt || s.unsubscribedAt > asOf);
  const nowIso = new Date().toISOString();
  const subscriberCountNow = subscribers.filter((s) =>
    isActive(s, nowIso),
  ).length;
  const subscriberCountAtCutoff = subscribers.filter((s) =>
    isActive(s, cutoffIso),
  ).length;

  return {
    windowDays,
    sends,
    totals,
    subscriberCountNow,
    subscriberGrowthInWindow:
      subscriberCountNow - subscriberCountAtCutoff,
  };
}
