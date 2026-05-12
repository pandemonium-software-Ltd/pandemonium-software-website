// GET /api/admin/diagnose-github — diagnostic endpoint for the
// "Approve & deploy" 403 error. Reports what the marketing-site
// Worker sees for GITHUB_TOKEN/OWNER/REPO and probes GitHub with
// the stored token so the operator can compare against what they
// THINK is set without leaking the secret.
//
// Auth: middleware Basic Auth on /api/admin/* — Ben only.
//
// Output is intentionally verbose. Drop-in remove once the token
// issue is resolved (or keep for future ops sanity checks).

import { NextResponse } from "next/server";
import { getServerEnvOptional } from "@/lib/env";

export const runtime = "nodejs";

type TokenSummary = {
  set: boolean;
  length: number;
  prefix: string;
  suffix: string;
  startsWithGhp: boolean;
  startsWithGithubPat: boolean;
  hasWhitespace: boolean;
};

function summariseToken(token: string | undefined): TokenSummary {
  if (!token) {
    return {
      set: false,
      length: 0,
      prefix: "",
      suffix: "",
      startsWithGhp: false,
      startsWithGithubPat: false,
      hasWhitespace: false,
    };
  }
  return {
    set: true,
    length: token.length,
    prefix: token.slice(0, 4),
    suffix: token.slice(-4),
    startsWithGhp: token.startsWith("ghp_"),
    startsWithGithubPat: token.startsWith("github_pat_"),
    // Common cause of "looks right but rejects" — a trailing newline
    // from `echo "TOKEN" |` (without -n) makes a fresh, broken value.
    hasWhitespace: /\s/.test(token),
  };
}

export async function GET() {
  const env = getServerEnvOptional();
  const tokenSummary = summariseToken(env.GITHUB_TOKEN);
  const owner = env.GITHUB_OWNER ?? null;
  const repo = env.GITHUB_REPO ?? null;

  // Read-only probe: GET /repos/{owner}/{repo} requires only
  // `Contents: read` for fine-grained PATs, or `repo` for classic.
  // If this fails, the dispatch (which needs Contents: write +
  // Actions: write OR `repo`) will also fail.
  let probe: {
    attempted: boolean;
    status?: number;
    statusText?: string;
    bodyPreview?: string;
    acceptedPermissions?: string | null;
    scopes?: string | null;
  } = { attempted: false };

  if (env.GITHUB_TOKEN && owner && repo) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "pandemonium-software-website-worker",
          },
        },
      );
      const body = await res.text().catch(() => "");
      probe = {
        attempted: true,
        status: res.status,
        statusText: res.statusText,
        bodyPreview: body.slice(0, 300),
        // GitHub returns these on 403 to tell you what scopes you'd
        // need to make the call work — invaluable for diagnosing
        // "wrong token type" issues.
        acceptedPermissions: res.headers.get("x-accepted-github-permissions"),
        scopes: res.headers.get("x-oauth-scopes"),
      };
    } catch (e) {
      probe = {
        attempted: true,
        bodyPreview: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Also probe the dispatch endpoint itself — POST with a probe
  // event_type that the workflow ignores (no matching `types:`
  // filter). GitHub still returns 204 if the token has dispatch
  // rights; 403 if not. This proves the token can dispatch
  // separately from whether it can read the repo.
  let dispatchProbe: {
    attempted: boolean;
    status?: number;
    bodyPreview?: string;
    acceptedPermissions?: string | null;
  } = { attempted: false };

  if (env.GITHUB_TOKEN && owner && repo) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "pandemonium-software-website-worker",
          },
          body: JSON.stringify({
            event_type: "diagnose-noop-event",
            client_payload: { source: "diagnose-github" },
          }),
        },
      );
      const body = await res.text().catch(() => "");
      dispatchProbe = {
        attempted: true,
        status: res.status,
        bodyPreview: body.slice(0, 300),
        acceptedPermissions: res.headers.get("x-accepted-github-permissions"),
      };
    } catch (e) {
      dispatchProbe = {
        attempted: true,
        bodyPreview: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return NextResponse.json(
    {
      env: {
        token: tokenSummary,
        owner,
        repo,
      },
      readProbe: probe,
      dispatchProbe,
      hint:
        tokenSummary.hasWhitespace
          ? "Token contains whitespace — almost always a trailing newline from `echo` without `-n`. Re-set the secret with `printf %s` or `echo -n`."
          : !tokenSummary.set
            ? "GITHUB_TOKEN is not set on this Worker. Run: npx wrangler secret put GITHUB_TOKEN"
            : dispatchProbe.status === 204
              ? "Token works — dispatch returned 204. If 'Approve & deploy' still fails, check OWNER/REPO match the workflow repo."
              : dispatchProbe.status === 403
                ? "Token rejected. Compare prefix/suffix above with the token you tested locally — they should match exactly."
                : "Inspect probe responses above.",
    },
    { status: 200 },
  );
}
