import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "This page has popped out for a tea break. Let's get you back home.",
};

export default function NotFound() {
  return (
    <section className="section bg-cream-50">
      <div className="container-content max-w-2xl text-center">
        <div className="mx-auto mb-10 w-48">
          <svg
            viewBox="0 0 240 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="Illustration of a tea mug with steam"
            className="h-auto w-full"
          >
            <path
              d="M70 60 Q72 40 78 30 M100 60 Q102 40 108 30 M130 60 Q132 40 138 30"
              stroke="#8ba5c6"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <rect
              x="60"
              y="60"
              width="100"
              height="90"
              rx="10"
              fill="#ffffff"
              stroke="#0f1d30"
              strokeWidth="3"
            />
            <path
              d="M160 85 Q 190 85 190 115 Q 190 140 160 140"
              fill="none"
              stroke="#0f1d30"
              strokeWidth="3"
            />
            <rect
              x="60"
              y="85"
              width="100"
              height="12"
              fill="#f97316"
            />
          </svg>
        </div>

        <span className="eyebrow">404</span>
        <h1 className="heading-1">
          This page has popped out for a tea break.
        </h1>
        <p className="prose-body mx-auto mt-6 max-w-xl">
          I can&apos;t find the page you were after. It might have moved, or
          the link might be wrong. Either way, let&apos;s get you back
          somewhere useful.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/" className="btn-primary">
            Back to the homepage
          </Link>
          <Link href="/pricing" className="btn-secondary">
            See pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
