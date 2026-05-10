"use client";

// Client-side login form. Posts to /api/login/[token] with the
// password + return URL; on success the API sets the session
// cookie and we hard-navigate to the return path (so the new
// cookie takes effect immediately).
//
// Forgot-password is a small inline POST to /api/login/[token]/reset
// — also surfaces inline status; on success we redirect back to
// /login/[token]?just=reset which renders the green "new password
// emailed" banner.
//
// Rate-limit + brute-force protection lives server-side. Client
// shows generic error messages so we don't leak whether a token
// exists.

import { useState } from "react";

type Props = {
  token: string;
  returnTo: string | null;
};

export default function LoginForm({ token, returnTo }: Props) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"none" | "login" | "reset">("none");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending("login");
    try {
      const res = await fetch(`/api/login/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, returnTo }),
      });
      if (res.ok) {
        const json = (await res.json()) as { redirectTo?: string };
        // Hard nav so the cookie takes effect on the next request.
        window.location.href = json.redirectTo ?? `/account/${token}`;
        return;
      }
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(json.error ?? "Sign in failed. Try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending("none");
    }
  }

  async function handleReset() {
    setError(null);
    setPending("reset");
    try {
      const res = await fetch(`/api/login/${token}/reset`, {
        method: "POST",
      });
      if (res.ok) {
        window.location.href = `/login/${token}?just=reset`;
        return;
      }
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(json.error ?? "Couldn't reset just now. Try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending("none");
    }
  }

  const busy = pending !== "none";

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <label className="block text-sm font-semibold text-navy-900">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          autoFocus
          disabled={busy}
          maxLength={200}
          className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base font-mono text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          placeholder="From the email I sent you"
        />
      </label>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-ember-200 bg-ember-50 p-3 text-sm text-ember-800"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="mt-5 w-full rounded-full bg-brand-primary-500 px-5 py-3 font-semibold text-brand-primary-text transition-all hover:-translate-y-px hover:bg-brand-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending === "login" ? "Signing in…" : "Sign in"}
      </button>

      <button
        type="button"
        onClick={handleReset}
        disabled={busy}
        className="mt-4 block text-sm text-navy-600 underline hover:text-navy-900 disabled:opacity-50"
      >
        {pending === "reset"
          ? "Sending new password…"
          : "Forgot password? Email me a new one"}
      </button>
    </form>
  );
}
