// Locations section — renders one card per extra location for
// multi-location customers. Mounted on the homepage AND on the
// /contact page (when present) so visitors find branch contact
// details from either entry point.
//
// Each card shows: location name, address (with "Open in Maps"
// link if mapUrl set), phone (tap-to-call), optional email, and
// opening hours (when set per-location; otherwise hidden — the
// page footer/primary hours apply).
//
// The primary business address is rendered separately (Footer +
// Contact page) — these are EXTRAS. Component returns null when
// the array is empty / undefined so single-location customers
// see no change.

import type { ExtraLocation, DayOfWeek } from "@/lib/types";

const DAY_ORDER: readonly DayOfWeek[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

type Props = {
  locations: readonly ExtraLocation[] | undefined;
};

export default function Locations({ locations }: Props) {
  if (!locations || locations.length === 0) return null;
  return (
    <section
      id="locations"
      className="py-16 md:py-20"
      aria-labelledby="locations-heading"
    >
      <div className="mx-auto max-w-6xl px-4">
        <h2
          id="locations-heading"
          className="text-3xl font-bold md:text-4xl"
        >
          Our locations
        </h2>
        <p className="mt-3 text-base text-slate-700">
          Visit, call or email any of our branches — whichever&apos;s
          most convenient.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc, i) => (
            <LocationCard key={`${loc.name}-${i}`} location={loc} />
          ))}
        </div>
      </div>
    </section>
  );
}

function LocationCard({ location }: { location: ExtraLocation }) {
  const phoneTel = location.phoneTel?.trim();
  const phoneDisplay = location.phoneDisplay?.trim() || phoneTel;
  const email = location.publicEmail?.trim();
  const address = location.address?.trim();
  const mapUrl = location.mapUrl?.trim();
  const hours = location.hoursStructured;
  const hasHours = hours && Object.keys(hours).length > 0;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold">{location.name}</h3>
      <div className="mt-4 space-y-3 text-sm text-slate-800">
        {address && (
          <div>
            <p className="whitespace-pre-line">{address}</p>
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm font-medium text-[var(--brand-primary,#1d3a5f)] underline"
              >
                Open in Maps →
              </a>
            )}
          </div>
        )}
        {phoneDisplay && (
          <p>
            <span className="text-xs uppercase tracking-wider text-slate-500">
              Phone
            </span>
            <br />
            {phoneTel ? (
              <a
                href={`tel:${phoneTel}`}
                className="font-medium text-[var(--brand-primary,#1d3a5f)]"
              >
                {phoneDisplay}
              </a>
            ) : (
              <span>{phoneDisplay}</span>
            )}
          </p>
        )}
        {email && (
          <p>
            <span className="text-xs uppercase tracking-wider text-slate-500">
              Email
            </span>
            <br />
            <a
              href={`mailto:${email}`}
              className="font-medium text-[var(--brand-primary,#1d3a5f)]"
            >
              {email}
            </a>
          </p>
        )}
        {hasHours && (
          <dl className="border-t border-slate-100 pt-3">
            <dt className="text-xs uppercase tracking-wider text-slate-500">
              Opening hours
            </dt>
            <dd className="mt-2 space-y-1">
              {DAY_ORDER.map((day) => {
                const h = hours?.[day];
                return (
                  <div
                    key={day}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="font-medium">{day}</span>
                    <span className="text-slate-700">
                      {h?.open && h.from && h.to
                        ? `${h.from}–${h.to}`
                        : "Closed"}
                    </span>
                  </div>
                );
              })}
            </dd>
          </dl>
        )}
      </div>
    </article>
  );
}
