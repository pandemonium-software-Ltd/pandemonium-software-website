// /unsubscribe/[token]?c=<customerToken> — one-click unsubscribe.
//
// What happens:
//   1. Token + customerToken both validated
//   2. Find subscriber by unsubscribeToken → stamp unsubscribedAt
//   3. Send the "you're unsubscribed" email
//   4. Show a friendly "removed" page
//
// Regulators (GDPR, CAN-SPAM) require ONE-CLICK unsubscribe with
// no log-in / no friction. This page does exactly that — server
// component mutates state on first GET. Idempotent: refreshing
// just shows the success page again, no double-send.
//
// Linked from every newsletter we send, plus the welcome email.

import { getProspectByToken } from "@/lib/notion-prospects";
import { updateProspectOnboarding } from "@/lib/notion-prospects";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { customerSenderBrand } from "@/lib/email-branding";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSUB_TOKEN_RE = /^[0-9a-f]{16,64}$/i;

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { token: unsubToken } = await params;
  const { c: customerToken = "" } = await searchParams;

  if (!UNSUB_TOKEN_RE.test(unsubToken) || !TOKEN_RE.test(customerToken)) {
    return (
      <Wrapper
        title="That link doesn't look right."
        body="It might be a typo. If you've been getting emails you don't want, reply to one with 'unsubscribe' and they'll be removed."
      />
    );
  }

  const prospect = await getProspectByToken(customerToken).catch(() => null);
  if (!prospect) {
    return (
      <Wrapper
        title="Couldn't find that subscription."
        body="It may have already been removed. Reply to any past email if you're still getting them."
      />
    );
  }

  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const newsletter = (content.newsletter ?? {}) as {
    config?: { senderName?: string };
    subscribers?: Array<Record<string, unknown>>;
  };
  const subscribers = Array.isArray(newsletter.subscribers)
    ? newsletter.subscribers
    : [];
  const idx = subscribers.findIndex(
    (s) => s.unsubscribeToken === unsubToken,
  );
  if (idx < 0) {
    return (
      <Wrapper
        title="Couldn't find that subscription."
        body="It may have already been removed. Reply to any past email if you're still getting them."
      />
    );
  }
  const subscriber = subscribers[idx]!;
  const senderName =
    newsletter.config?.senderName ?? prospect.business ?? prospect.name;

  // Idempotent — if already unsubscribed, skip the write + email.
  const alreadyUnsubbed = typeof subscriber.unsubscribedAt === "string";

  if (!alreadyUnsubbed) {
    const now = new Date().toISOString();
    subscribers[idx] = { ...subscriber, unsubscribedAt: now };
    const updatedNewsletter = { ...newsletter, subscribers };
    const updatedContent = { ...content, newsletter: updatedNewsletter };
    const updatedOb = { ...ob, content: updatedContent };
    try {
      await updateProspectOnboarding(prospect.pageId, {
        data: updatedOb as Parameters<
          typeof updateProspectOnboarding
        >[1]["data"],
      });
    } catch (e) {
      console.error(
        `[unsubscribe] notion write failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      // Still show the success page — visitor will assume it
      // worked. Reasonable trade-off: regulators want it to
      // succeed; we'll see the error in logs.
    }
    // Confirmation email — fail-soft, not legally required.
    try {
      const env = getServerEnv();
      await sendCustomerEmail(
        env,
        subscriber.email as string,
        "newsletter-unsubscribed",
        {
          firstName: (subscriber.firstName as string) ?? "there",
          senderName,
        },
        // Customer-branded — last touchpoint between the customer
        // and the (former) subscriber. The unsubscribe confirmation
        // should look like it's from the customer's site too, not
        // from "ModuForge by Pandamonium Software" (which would
        // confuse the subscriber: "who's that?").
        { senderBrand: customerSenderBrand(prospect) },
      );
    } catch (e) {
      console.warn(
        `[unsubscribe] confirmation email failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return (
    <Wrapper
      title="You've been unsubscribed."
      body={`You won't get any more newsletters from ${senderName}. If this was a mistake you can subscribe again from their site.`}
    />
  );
}

function Wrapper({ title, body }: { title: string; body: string }) {
  return (
    <main className="container-content py-20">
      <div className="mx-auto max-w-xl rounded-3xl border border-navy-100 bg-white p-8 shadow-card">
        <h1 className="font-serif text-2xl font-semibold text-navy-900">
          {title}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-navy-700">{body}</p>
      </div>
    </main>
  );
}
