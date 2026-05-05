// Notion client initialisation.
//
// One Client per Worker invocation (lazy-init via `getNotion()`).
// The client is cheap to create and Cloudflare Workers don't share
// state across requests so there's no benefit to a singleton.

import { Client } from "@notionhq/client";
import { getServerEnv } from "./env";

let cachedClient: Client | null = null;

export function getNotion(): Client {
  if (cachedClient) return cachedClient;
  const env = getServerEnv();
  cachedClient = new Client({
    auth: env.NOTION_API_KEY,
    // Notion API is reasonably fast but Cloudflare Workers have a
    // CPU time budget. 8s is well within the 30s wall-clock limit
    // and gives us room for retries.
    timeoutMs: 8_000,
  });
  return cachedClient;
}

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
  const notion = getNotion();

  async function check(
    id: string | undefined,
    label: string,
  ): Promise<{ id: string; title: string } | { error: string }> {
    if (!id) return { error: `${label} env var not set` };
    try {
      const db = await notion.databases.retrieve({ database_id: id });
      const titleProp =
        "title" in db && Array.isArray(db.title) && db.title[0]
          ? (db.title[0] as { plain_text?: string }).plain_text
          : undefined;
      return { id, title: titleProp ?? "(untitled)" };
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
