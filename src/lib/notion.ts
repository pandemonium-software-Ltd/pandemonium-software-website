// Thin Notion REST API wrapper. Uses native fetch directly rather than
// @notionhq/client because the SDK's compiled-down private-class-field
// helpers don't survive OpenNext's bundling for Cloudflare Workers
// (the runtime trips on `state.has(receiver)` when state is null).
//
// Native fetch is available everywhere — in Cloudflare Workers, in
// Node 18+, and in tsx scripts — so this works in both prod and
// `scripts/test-*.ts` smoke tests without any environment-specific shims.

import { getServerEnv } from "./env";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class NotionApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(`Notion API ${status}${code ? ` (${code})` : ""}: ${message}`);
    this.name = "NotionApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Make an authenticated request to the Notion REST API.
 *
 * Throws NotionApiError with status + message on non-2xx, AbortError
 * on timeout, and TypeError on network failures (let the caller decide
 * how to surface those).
 */
export async function notionFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const env = getServerEnv();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${NOTION_API_BASE}${path}`, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${env.NOTION_API_KEY}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        let code: string | undefined;
        let message = res.statusText;
        try {
          const errBody = (await res.json()) as {
            message?: string;
            code?: string;
          };
          if (errBody?.message) message = errBody.message;
          if (errBody?.code) code = errBody.code;
        } catch {
          // body wasn't JSON — keep the statusText
        }

        if (isRetryable(res.status) && attempt < MAX_RETRIES) {
          const retryAfter = res.headers.get("Retry-After");
          const delayMs = retryAfter
            ? Math.min(Number(retryAfter) * 1000, 5000)
            : RETRY_BASE_MS * 2 ** attempt;
          console.warn(
            `[notion] ${res.status} on ${init.method ?? "GET"} ${path} — retry ${attempt + 1}/${MAX_RETRIES} in ${delayMs}ms`,
          );
          await sleep(delayMs);
          continue;
        }

        throw new NotionApiError(res.status, message, code);
      }

      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof NotionApiError) throw e;
      if (attempt < MAX_RETRIES && !(e instanceof DOMException)) {
        console.warn(
          `[notion] network error on ${init.method ?? "GET"} ${path} — retry ${attempt + 1}/${MAX_RETRIES}`,
        );
        await sleep(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("notionFetch: exhausted retries (unreachable)");
}

// ---------- Database verification ----------

type NotionDbResponse = {
  id: string;
  title?: { plain_text?: string }[];
};

/**
 * Verifies the four databases (Prospects, Clients, Assets, Exceptions)
 * are reachable from the Notion API. Returns the database titles for
 * a sanity check. Used by the admin page and by setup scripts.
 */
export async function verifyNotionDatabases(): Promise<{
  prospects: { id: string; title: string } | { error: string };
  clients: { id: string; title: string } | { error: string };
  assets: { id: string; title: string } | { error: string };
  exceptions: { id: string; title: string } | { error: string };
}> {
  const env = getServerEnv();

  async function check(
    id: string | undefined,
    label: string,
  ): Promise<{ id: string; title: string } | { error: string }> {
    if (!id) return { error: `${label} env var not set` };
    try {
      const db = await notionFetch<NotionDbResponse>(`/databases/${id}`);
      const title = db.title?.[0]?.plain_text ?? "(untitled)";
      return { id, title };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  const [prospects, clients, assets, exceptions] = await Promise.all([
    check(env.NOTION_PROSPECTS_DB_ID, "NOTION_PROSPECTS_DB_ID"),
    check(env.NOTION_CLIENTS_DB_ID, "NOTION_CLIENTS_DB_ID"),
    check(env.NOTION_ASSETS_DB_ID, "NOTION_ASSETS_DB_ID"),
    check(env.NOTION_EXCEPTIONS_DB_ID, "NOTION_EXCEPTIONS_DB_ID"),
  ]);

  return { prospects, clients, assets, exceptions };
}
