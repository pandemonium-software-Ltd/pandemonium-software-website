// Thin Resend REST API client for domain management.
//
// Used by step2b-resend-domain to register customer domains with
// Resend, retrieve the required DNS records, and trigger
// verification. Once verified, newsletter emails can be sent from
// the customer's own domain instead of modu-forge.co.uk.
//
// Auth: RESEND_API_KEY (already in env for email sending).

import { getServerEnv } from "./env";

const RESEND_API_BASE = "https://api.resend.com";
const TIMEOUT_MS = 10_000;

export class ResendApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`Resend API ${status}: ${message}`);
    this.name = "ResendApiError";
    this.status = status;
  }
}

async function resendFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const env = getServerEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${RESEND_API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const errBody = (await res.json()) as {
          message?: string;
          error?: string;
        };
        message = errBody.message ?? errBody.error ?? message;
      } catch {
        // body wasn't JSON
      }
      throw new ResendApiError(res.status, message);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Domain types ----------

export type ResendDnsRecord = {
  record: "SPF" | "DKIM" | "Tracking";
  name: string;
  type: "MX" | "TXT" | "CNAME";
  ttl: string;
  status: "not_started" | "pending" | "verified" | "failed" | "temporary_failure";
  value: string;
  priority?: number;
};

export type ResendDomain = {
  id: string;
  name: string;
  status: "not_started" | "pending" | "verified" | "failed" | "temporary_failure";
  created_at: string;
  region: string;
  records: ResendDnsRecord[];
};

// ---------- API functions ----------

export async function createResendDomain(
  name: string,
  opts?: { region?: string },
): Promise<ResendDomain> {
  return resendFetch<ResendDomain>("/domains", {
    method: "POST",
    body: {
      name,
      region: opts?.region ?? "eu-west-1",
    },
  });
}

export async function getResendDomain(
  domainId: string,
): Promise<ResendDomain> {
  return resendFetch<ResendDomain>(`/domains/${domainId}`);
}

export async function verifyResendDomain(
  domainId: string,
): Promise<{ id: string }> {
  return resendFetch<{ id: string }>(`/domains/${domainId}/verify`, {
    method: "POST",
  });
}

export async function listResendDomains(): Promise<{
  data: Array<{ id: string; name: string; status: string }>;
}> {
  return resendFetch<{
    data: Array<{ id: string; name: string; status: string }>;
  }>("/domains");
}

export async function deleteResendDomain(
  domainId: string,
): Promise<void> {
  await resendFetch<unknown>(`/domains/${domainId}`, { method: "DELETE" });
}
