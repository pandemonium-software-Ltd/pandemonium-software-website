// POST /api/public/enquiry — public contact-form endpoint.
//
// Called by the EnquiryFormWidget on customer sites when a visitor
// submits the contact form. Validates the prospect owns the
// Enquiry Form module + has captured a recipient email, sends a
// transactional email to that recipient via Resend with the
// visitor's details, and returns success.
//
// Permissive CORS — anyone can POST (the customerToken in the body
// couples the request to a specific customer; preview-mode gating
// happens client-side in the widget so test submissions on a
// pre-launch preview don't fire emails).
//
// Anti-spam: a hidden honeypot field (`hp`) must be empty. Bots
// fill every input they find; legitimate users leave it blank.
// Not bulletproof but catches the lazy 80% with zero UX cost.
// Per-IP rate limiting will follow when we add a KV-backed store
// — for now the honeypot + length caps are the only gates.
//
// Email semantics:
//   from     "Ben @ ModuForge <ben@modu-forge.co.uk>"  (brand)
//   to       prospect's `recipientEmail` (captured at intake)
//   replyTo  the visitor's email — so when the customer hits Reply
//            in their inbox, the message goes straight to the
//            person who enquired.
//
// Failure modes:
//   400 schema invalid / honeypot tripped / token format wrong
//   404 prospect not found (returned as 400 generic to avoid
//       enumeration)
//   429 — not implemented yet (future)
//   503 Resend missing / down / unconfigured
//
// Storage: NOT persisted on the prospect record today. Email is
// the contract for the customer; they read enquiries in their
// inbox like any other email. A future iteration may stamp a
// count + summary on the prospect so the dashboard can show
// "received 3 enquiries this month" without storing the full body.

import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { getProspectByToken } from "@/lib/notion-prospects";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same brand FROM as the other customer-facing emails (see
// src/lib/email.ts). When Stage 3 ships the dedicated transactional
// sender domain we update both at once.
const FROM_BRAND = "ModuForge <ben@modu-forge.co.uk>";

const NAME_MAX = 100;
const PHONE_MAX = 30;
const MESSAGE_MAX = 5000;
const EMAIL_MAX = 254;

const requestSchema = z.object({
  customerToken: z.string().regex(TOKEN_RE),
  name: z.string().trim().min(1).max(NAME_MAX),
  email: z.string().trim().toLowerCase().email().max(EMAIL_MAX),
  /** Visitor's phone — optional. We don't validate format (UK
   *  customers want international flexibility); just length-cap. */
  phone: z.string().trim().max(PHONE_MAX).optional(),
  message: z.string().trim().min(10).max(MESSAGE_MAX),
  /** Hidden honeypot — legitimate users leave this empty; bots
   *  fill every input they see. Server-side check rejects any
   *  non-empty value with a generic success response so bots
   *  don't learn they've been blocked. */
  hp: z.string().max(200).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonError(status: number, message: string) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: corsHeaders() },
  );
}

function jsonOk(body: Record<string, unknown> = {}) {
  return NextResponse.json(
    { success: true, ...body },
    { headers: corsHeaders() },
  );
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "Invalid request body.");
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      400,
      parsed.error.issues[0]?.message ?? "Invalid request.",
    );
  }
  const { customerToken, name, email, phone, message, hp } = parsed.data;

  // Honeypot tripped: return a generic success so bots think they
  // got through (otherwise they'll iterate variations to find what
  // works). Nothing's sent + nothing's stored.
  if (hp && hp.trim().length > 0) {
    console.warn(
      `[enquiry] honeypot tripped for customer ${customerToken.slice(0, 8)} — silent drop`,
    );
    return jsonOk({ stored: false });
  }

  const prospect = await getProspectByToken(customerToken).catch(() => null);
  if (!prospect) {
    // Generic message — don't leak which tokens are valid.
    return jsonError(
      400,
      "Couldn't send your message just now. Try again later.",
    );
  }
  if (!prospect.moduleSelections.includes("Enquiry Form")) {
    // Same generic message — defence against enumerating which
    // customers have the module.
    return jsonError(
      400,
      "Couldn't send your message just now. Try again later.",
    );
  }

  // Resolve the recipient email — the customer's public-facing
  // contact email (set on the prospect record + overridable via
  // Hub Step 4 Content's "publicEmail" field). Falls back to the
  // prospect's onboarding contact email if Content hasn't been
  // edited.
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as {
    business?: { publicEmail?: unknown };
  };
  const recipientEmail =
    typeof content.business?.publicEmail === "string" &&
    content.business.publicEmail.trim()
      ? content.business.publicEmail.trim()
      : (prospect.email ?? "").trim();
  if (!recipientEmail) {
    console.error(
      `[enquiry] no recipient email for ${customerToken.slice(0, 8)} — prospect.email empty + content.business.publicEmail unset`,
    );
    return jsonError(503, "We can't deliver enquiries right now.");
  }

  // Compose the email body. Plain text so spam filters treat it
  // kindly + so the customer's reply-all behaviour is predictable
  // (HTML bodies sometimes pull the wrong "from" address into the
  // To: line on reply).
  const businessName = prospect.business?.trim() ?? prospect.name;
  const lines = [
    `You've got a new enquiry${businessName ? ` for ${businessName}` : ""} via your website.`,
    "",
    "─".repeat(48),
    `From:    ${name}`,
    `Email:   ${email}`,
    ...(phone ? [`Phone:   ${phone}`] : []),
    "─".repeat(48),
    "",
    "Message:",
    "",
    message,
    "",
    "─".repeat(48),
    "Reply to this email and your message goes straight back to",
    `${name}.`,
    "",
    "— ModuForge",
  ];
  const body = lines.join("\n");
  const subjectLabel = name.length > 40 ? name.slice(0, 40) + "…" : name;

  // Send via Resend. We use the SDK directly here (not
  // sendCustomerNotification) because that helper doesn't expose
  // replyTo, and the visitor's email is the whole point of the
  // forwarding pattern.
  const env = getServerEnv();
  if (!env.RESEND_API_KEY) {
    console.error("[enquiry] RESEND_API_KEY not configured");
    return jsonError(503, "Enquiries are paused right now. Try again later.");
  }
  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM_BRAND,
      to: recipientEmail,
      replyTo: email,
      subject: `New enquiry from ${subjectLabel}`,
      text: body,
    });
    if (error) {
      console.error(
        `[enquiry] Resend error for ${customerToken.slice(0, 8)}:`,
        error,
      );
      return jsonError(
        503,
        "Couldn't send your message just now. Try again or call them directly.",
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[enquiry] Resend exception for ${customerToken.slice(0, 8)}: ${msg}`,
    );
    return jsonError(
      503,
      "Couldn't send your message just now. Try again later.",
    );
  }

  return jsonOk();
}
