// Thin GitHub REST API client. Stage 2C C5.4.
//
// Used by the ops worker step5-review to trigger
// .github/workflows/customer-site-build.yml via the
// repository_dispatch endpoint. The Action then handles the actual
// build + deploy and calls /api/internal/build-callback when done.
//
// Auth: GITHUB_TOKEN with `repo` scope (or fine-grained equivalent
// covering Actions: read+write). Scoped to one repo via
// GITHUB_OWNER + GITHUB_REPO. Failure is bubbled up as a Cowork
// exception so the operator can see + retry.

const GITHUB_API_BASE = "https://api.github.com";
const TIMEOUT_MS = 10_000;

// M-11: Per-tick dispatch cap — prevents a runaway tick from
// flooding GitHub Actions with workflow runs. Reset at the start
// of each tick via resetDispatchCounter().
let dispatchesThisTick = 0;
const MAX_DISPATCHES_PER_TICK = 5;
export function resetDispatchCounter(): void {
  dispatchesThisTick = 0;
}

export class GithubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`GitHub API ${status}: ${message}`);
    this.name = "GithubApiError";
    this.status = status;
  }
}

/**
 * Fire a repository_dispatch event against the configured repo.
 * The matching workflow listens for this event_type. Payload is
 * passed through as-is to the workflow's `github.event.client_payload`.
 *
 * Idempotent on GitHub's side (repository_dispatch always queues a
 * fresh run; no de-dup). De-dup is handled by the caller via the
 * Preview Build Triggered At latch.
 */
export async function dispatchRepositoryEvent(args: {
  token: string; // GitHub PAT or fine-grained token
  owner: string;
  repo: string;
  eventType: string;
  clientPayload: Record<string, unknown>;
}): Promise<void> {
  // M-11: Per-tick dispatch cap
  if (dispatchesThisTick >= MAX_DISPATCHES_PER_TICK) {
    throw new Error("dispatch cap reached for this tick");
  }

  const url = `${GITHUB_API_BASE}/repos/${args.owner}/${args.repo}/dispatches`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        // GitHub REQUIRES a User-Agent on every API call — without
        // it, all responses are 403 "Request forbidden by
        // administrative rules". Cloudflare Workers' default fetch
        // sends no UA, so we set one explicitly. curl sends one
        // automatically, which is why the same token works from
        // the terminal but not from the Worker. GitHub asks you
        // to identify the integration; project name is fine.
        // https://docs.github.com/en/rest/overview/resources-in-the-rest-api#user-agent-required
        "User-Agent": "pandemonium-software-website-worker",
      },
      body: JSON.stringify({
        event_type: args.eventType,
        client_payload: args.clientPayload,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Try JSON first (GitHub usually returns `{message, documentation_url}`),
      // fall back to raw text (covers proxy / WAF responses), final
      // fallback statusText. Surfacing the body is what makes a 403
      // actionable — "Resource not accessible by personal access
      // token" vs "Bad credentials" vs scope-missing all read very
      // differently.
      let message = res.statusText || "(no body)";
      const bodyText = await res.text().catch(() => "");
      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText) as {
            message?: string;
            documentation_url?: string;
          };
          if (parsed?.message) {
            message = parsed.documentation_url
              ? `${parsed.message} (see ${parsed.documentation_url})`
              : parsed.message;
          } else {
            message = bodyText.slice(0, 200);
          }
        } catch {
          message = bodyText.slice(0, 200);
        }
      }
      throw new GithubApiError(res.status, message);
    }
    dispatchesThisTick += 1;
  } finally {
    clearTimeout(timeout);
  }
}
