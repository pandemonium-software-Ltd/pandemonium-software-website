export default function OptionalExtras() {
  return (
    <div className="mt-10">
      <h3 className="font-serif text-xl font-semibold text-navy-900 md:text-2xl">
        Optional extras
      </h3>
      <p className="mt-2 text-[1rem] text-navy-700">
        Separate from the calculator above. Mention any of these when you get
        in touch and we&apos;ll add them to your order.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-1">
        <ExtraCard
          title="Google Business Profile setup or audit"
          price="£29"
          frequency="one-off"
          body={
            <>
              <p>
                Your Google Business Profile is how most locals find you.
                We&apos;ll either set yours up from scratch (we&apos;ll send
                you a step-by-step so you can do the final Google
                verification) or audit your existing profile and give you a
                prioritised list of fixes that actually move the needle.
              </p>
              <p className="mt-3 text-[0.95rem] text-navy-600">
                Optional but recommended for any local business that gets
                customers from Google.
              </p>
            </>
          }
        />
      </div>
    </div>
  );
}

function ExtraCard({
  title,
  price,
  frequency,
  body,
}: {
  title: string;
  price: string;
  frequency: string;
  body: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h4 className="font-serif text-lg font-semibold text-navy-900">
            {title}
          </h4>
          <div className="mt-3 text-[0.95rem] leading-relaxed text-navy-700">
            {body}
          </div>
        </div>
        <div className="flex-none text-right">
          <p className="font-serif text-2xl font-semibold text-navy-900">
            {price}
          </p>
          <p className="text-xs uppercase tracking-wider text-navy-500">
            {frequency}
          </p>
        </div>
      </div>
    </div>
  );
}
