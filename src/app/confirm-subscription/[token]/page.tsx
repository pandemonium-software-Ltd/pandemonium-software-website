// /confirm-subscription/[token]?c=<customerToken> — landing page
// the subscriber lands on when they click the confirm link in the
// newsletter-confirm-subscribe email.
//
// What happens:
//   1. Token + customerToken both validated (must look like our
//      hex + UUID respectively)
//   2. Look up the prospect → find the subscriber by
//      confirmationToken → stamp confirmedAt = now
//   3. Send the welcome email
//   4. Render a friendly "you're in" page
//
// Server component — does the state mutation in the request so
// the page just shows the result. Safe to refresh: idempotent
// stamp (we don't re-send the welcome if confirmedAt is already
// set).

import { getProspectByToken } from "@/lib/notion-prospects";
import { updateProspectOnboarding } from "@/lib/notion-prospects";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { customerSenderBrand } from "@/lib/email-branding";
import { getServerEnv } from "@/lib/env";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIRM_TOKEN_RE = /^[0-9a-f]{16,64}$/i;

export default async function ConfirmSubscriptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { token: confirmToken } = await params;
  const { c: customerToken = "" } = await searchParams;

  if (!CONFIRM_TOKEN_RE.test(confirmToken) || !TOKEN_RE.test(customerToken)) {
    return (
      <Wrapper
        title="That link doesn't look right."
        body="It might be a typo, or the link might have expired. Try subscribing again from the website."
      />
    );
  }

  const prospect = await getProspectByToken(customerToken).catch(() => null);
  if (!prospect) {
    return (
      <Wrapper
        title="Couldn't find that subscription."
        body="Try subscribing again from the website — happens sometimes if a link is months old."
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
    (s) => s.confirmationToken === confirmToken,
  );
  if (idx < 0) {
    return (
      <Wrapper
        title="Couldn't find that subscription."
        body="The link may have expired or already been used. Try subscribing again from the website."
      />
    );
  }
  const subscriber = subscribers[idx]!;
  const senderName =
    newsletter.config?.senderName ?? prospect.business ?? prospect.name;

  // Idempotent: if already confirmed, just show the success page —
  // don't double-send the welcome.
  const alreadyConfirmed =
    typeof subscriber.confirmedAt === "string" && !subscriber.unsubscribedAt;

  if (!alreadyConfirmed) {
    const now = new Date().toISOString();
    subscribers[idx] = {
      ...subscriber,
      confirmedAt: now,
      // Clearing an old unsubscribedAt covers the re-subscribe
      // case (same email re-joining after unsubscribing).
      unsubscribedAt: undefined,
    };
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
        `[confirm-subscription] notion write failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return (
        <Wrapper
          title="Something went wrong on our end."
          body="Try refreshing this page in a minute. If it still doesn't work, the business will follow up."
        />
      );
    }
    // Welcome email — fail-soft, the confirmation already
    // succeeded in Notion.
    try {
      const env = getServerEnv();
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
      const unsubscribeUrl = `${baseUrl.replace(/\/$/, "")}/unsubscribe/${subscriber.unsubscribeToken}?c=${customerToken}`;
      await sendCustomerEmail(
        env,
        subscriber.email as string,
        "newsletter-welcome",
        {
          firstName: (subscriber.firstName as string) ?? "there",
          senderName,
          unsubscribeUrl,
        },
        // Customer-branded — same reasoning as the confirm-subscribe
        // email: the subscriber signed up to the customer's
        // newsletter, so this welcome should look like it's from
        // the customer's business, not ModuForge.
        { senderBrand: customerSenderBrand(prospect) },
      );
    } catch (e) {
      console.warn(
        `[confirm-subscription] welcome email failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return (
    <Wrapper
      title={`You're in 🎉`}
      body={`Thanks for confirming. You'll get a short update from ${senderName} roughly once a month — no spam, ever. You can unsubscribe any time using the link at the bottom of every email.`}
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
