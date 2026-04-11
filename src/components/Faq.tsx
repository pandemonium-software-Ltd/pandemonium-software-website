"use client";

import { useState } from "react";

type QA = {
  q: string;
  a: React.ReactNode;
};

export default function Faq({ items }: { items: QA[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ul className="divide-y divide-navy-100 overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-navy-100">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-start justify-between gap-6 px-6 py-6 text-left transition-colors hover:bg-cream-50 md:px-8"
            >
              <span className="font-serif text-lg font-semibold text-navy-900 md:text-xl">
                {item.q}
              </span>
              <span
                aria-hidden="true"
                className={[
                  "mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-full border-2 border-navy-200 transition-transform",
                  isOpen ? "rotate-45 bg-navy-900 text-white" : "text-navy-700",
                ].join(" ")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <line
                    x1="12"
                    y1="4"
                    x2="12"
                    y2="20"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <line
                    x1="4"
                    y1="12"
                    x2="20"
                    y2="12"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </button>
            {isOpen && (
              <div className="px-6 pb-7 md:px-8">
                <div className="max-w-3xl pl-0 text-[1.05rem] leading-relaxed text-navy-700">
                  {item.a}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
