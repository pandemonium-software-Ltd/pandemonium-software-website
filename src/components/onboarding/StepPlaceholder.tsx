// Onboarding Hub placeholder card for steps not yet wired up.
// Used in H1 to keep the customer's full step list visible while H2-H5
// fill in the real content. Replace usage with the real step component
// as each phase ships.

type Props = {
  title: string;
  /** e.g. "next update" or a date — shown in the small-print line. */
  arrivingIn: string;
  /** One-sentence preview of what this step will do. */
  summary: string;
};

export default function StepPlaceholder({ title, arrivingIn, summary }: Props) {
  return (
    <article className="rounded-3xl bg-white p-7 shadow-card md:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
        Coming {arrivingIn}
      </p>
      <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
        {title}
      </h2>
      <p className="mt-4 text-[1.05rem] leading-relaxed text-navy-700">
        {summary}
      </p>
      <p className="mt-5 text-sm text-navy-500">
        This part of the Hub is being built. You can carry on with the steps
        already available — I&apos;ll email you when this one&apos;s ready.
      </p>
    </article>
  );
}
