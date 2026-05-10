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
      },
      body: JSON.stringify({
        event_type: args.eventType,
        client_payload: args.clientPayload,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const err = (await res.json()) as { message?: string };
        if (err?.message) message = err.message;
      } catch {
        /* keep statusText */
      }
      throw new GithubApiError(res.status, message);
    }
  } finally {
    clearTimeout(timeout);
  }
}
