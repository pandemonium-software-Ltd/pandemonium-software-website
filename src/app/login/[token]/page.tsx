// /login/[token] — customer-side login form.
//
// Customer arrives here either by:
//   - Clicking a link in an email (with their token in the URL)
//   - Being redirected by middleware after hitting a gated page
//     without a valid session (cookie absent or expired)
//
// Form is single-field (password only) — the token is in the URL.
// Submit posts to /api/login/[token] which validates the password,
// sets the session cookie, and redirects to ?return=<original> or
// /account/[token] by default.
//
// "Forgot password" link triggers /api/login/[token]/reset which
// regenerates + emails a new password. Rate-limited at the API.

import LoginForm from "@/components/auth/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ return?: string; just?: string }>;
}) {
  const { token } = await params;
  const { return: returnTo, just } = await searchParams;

  if (!TOKEN_RE.test(token)) {
    return (
      <main className="container-content py-20">
        <div className="mx-auto max-w-md rounded-3xl border border-navy-100 bg-white p-8 shadow-card">
          <h1 className="font-serif text-2xl font-semibold text-navy-900">
            Link not valid
          </h1>
          <p className="mt-3 text-navy-700">
            That URL doesn&apos;t look right. Use the link in the
            most recent email I sent.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="container-content py-16 md:py-20">
      <div className="mx-auto max-w-md rounded-3xl border border-navy-100 bg-white p-8 shadow-card md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
          Sign in
        </p>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
          Welcome back
        </h1>
        <p className="mt-3 text-sm text-navy-700">
          Enter the password I sent to your email when your
          qualification was accepted. If you can&apos;t find it,
          use the &ldquo;Forgot password&rdquo; link below — I&apos;ll
          send a new one straight away.
        </p>
        {just === "reset" && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          >
            New password emailed. Check your inbox (it should land
            within a minute) and use it to sign in below.
          </p>
        )}
        <LoginForm token={token} returnTo={returnTo ?? null} />
      </div>
    </main>
  );
}
