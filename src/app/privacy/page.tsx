import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Pandemonium Software Ltd collects, uses and protects your data. Written in plain English by Ben Pandher.",
  alternates: { canonical: "/privacy" },
};

const lastUpdated = "11 April 2026";

export default function PrivacyPage() {
  return (
    <section className="section bg-white">
      <div className="container-content max-w-3xl">
        <span className="eyebrow">Legal</span>
        <h1 className="heading-1">Privacy policy</h1>
        <p className="mt-4 text-sm text-navy-600">Last updated: {lastUpdated}</p>

        <div className="long-form mt-10">
          <p>
            This is the privacy policy for{" "}
            <strong>Pandemonium Software Ltd</strong> — the company I run.
            It explains what personal information I collect from visitors to
            this website, why I collect it, and what your rights are.
          </p>
          <p className="text-sm text-navy-500">
            (The site currently runs on a Cloudflare Worker subdomain
            while a permanent custom domain is being registered. The
            URL shown in your address bar may differ from the brand
            name on this page during that transition.)
          </p>
          <p>
            I&apos;ve written this in plain English on purpose. If anything
            isn&apos;t clear, email me at{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> and
            I&apos;ll explain.
          </p>

          <h2>1. Who I am</h2>
          <p>
            I&apos;m Ben Pandher. I run{" "}
            <strong>Pandemonium Software Ltd</strong>, a small one-person
            software business based in Oxfordshire, United Kingdom, building
            websites for UK trades and small businesses. For the purposes of
            UK GDPR and the Data Protection Act 2018, Pandemonium Software
            Ltd is the <strong>data controller</strong> for any personal
            information you give me through this website.
          </p>
          <p>
            You can reach me at{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
          </p>

          <h2>2. What I collect, and why</h2>
          <p>I keep this short on purpose. I only collect what I need.</p>

          <h3>Things you send me directly</h3>
          <ul>
            <li>
              <strong>Enquiry details:</strong> if you email me directly or
              use the enquiry form, I&apos;ll see your name, email address,
              phone, business details, UK location and current website
              situation. When you submit the enquiry form, these details are
              saved to my private Notion workspace (a project-management
              tool) and I get a notification email so I can reply. I
              don&apos;t share these details with anyone else, and I delete
              them after 24 months if you don&apos;t become a client (see
              Section 6).
            </li>
            <li>
              <strong>Qualification and intake form data (for accepted
              clients):</strong> once you decide to work with me, I&apos;ll
              collect more detailed information through follow-up forms —
              business legal details, services, brand colours, logo, photos,
              module selections. This is held in the same private Notion
              workspace only for as long as I&apos;m building your site, and
              is transferred to your own accounts at handover.
            </li>
            <li>
              <strong>Payment details:</strong> if you become a paying
              client, Stripe handles your card details directly — I never
              see or store them. I do see your business name, invoice
              amounts, and payment status.
            </li>
          </ul>

          <h3>Things your browser tells me</h3>
          <ul>
            <li>
              <strong>Basic hosting logs:</strong> my host (Cloudflare)
              records things like IP address, browser type and the page you
              visited. This is standard for any website and is used for
              security and keeping the site running.
            </li>
            <li>
              <strong>Cookies:</strong> this site uses only strictly
              necessary cookies. I don&apos;t use tracking or advertising
              cookies. If I ever add analytics, I&apos;ll use a
              privacy-friendly tool and update this policy first.
            </li>
          </ul>

          <h2>3. Why I collect it (legal basis)</h2>
          <p>
            Under UK GDPR, I have to tell you my legal reason for holding
            your data:
          </p>
          <ul>
            <li>
              <strong>Legitimate interest:</strong> responding to enquiries
              and answering questions you send me. You&apos;d expect me to
              reply, so it&apos;s a reasonable interest.
            </li>
            <li>
              <strong>Contract:</strong> if you become a paying client, I
              process your data to deliver the service you&apos;ve paid for.
            </li>
            <li>
              <strong>Legal obligation:</strong> I&apos;m required to keep
              some business and tax records under UK law.
            </li>
          </ul>

          <h2>4. Who I share it with (sub-processors)</h2>
          <p>
            I use a small number of trusted third parties to run the
            business. I only share what they need to do their job:
          </p>
          <ul>
            <li>
              <strong>Cloudflare, Inc.</strong> — hosts this website as a
              Cloudflare Worker serving static assets, and keeps basic edge
              logs for security and anti-abuse purposes.
            </li>
            <li>
              <strong>Resend</strong> — sends transactional emails (for
              example, a reply confirmation). Only used if you become a
              client.
            </li>
            <li>
              <strong>Stripe</strong> — handles card payments for paid
              services. Stripe is PCI-DSS certified and I never see your
              card details.
            </li>
            <li>
              <strong>Notion</strong> — where I keep records of every
              enquiry, qualification answer, intake form, and client
              project. This is the primary store for the data you give me.
            </li>
            <li>
              <strong>Anthropic</strong> — provides the AI model (Claude)
              I use as my operations assistant. See Section 5 below for
              what that AI does and doesn&apos;t do with your data.
            </li>
          </ul>
          <p>
            I don&apos;t sell your data. I don&apos;t rent it. I don&apos;t
            swap it with anyone for marketing. Ever.
          </p>

          <h2>5. How I use AI in my operations</h2>
          <p>
            I run my operations with an AI assistant (Anthropic&apos;s
            Claude). It helps me handle the routine work: reading incoming
            enquiries, drafting replies against my playbook, running
            compatibility checks, and tracking client progress.
          </p>
          <p>
            What this means for your data:
          </p>
          <ul>
            <li>
              The AI processes the information you give me through the
              enquiry, qualification and intake forms in order to draft my
              reply or update my Notion records.
            </li>
            <li>
              <strong>Every client-facing email the AI drafts is reviewed
              by me before it sends.</strong> No automated emails go out
              without my human approval during your initial enquiry,
              qualification and acceptance stages.
            </li>
            <li>
              No automated decision-making with legal or significant
              effects on you (for example, no automated credit decisions or
              legally binding contracts) takes place. I personally review
              every accept / reject decision.
            </li>
            <li>
              Anthropic&apos;s commercial API does not use your data to
              train its models, per their{" "}
              <a
                href="https://www.anthropic.com/legal/commercial-terms"
                target="_blank"
                rel="noopener noreferrer"
              >
                commercial terms
              </a>
              .
            </li>
            <li>
              If you&apos;d prefer no AI processing of your enquiry, email
              me directly at{" "}
              <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
              {" "}with the subject line &quot;no AI&quot; and I&apos;ll
              handle your enquiry by hand.
            </li>
          </ul>

          <h2>6. How long I keep it</h2>
          <ul>
            <li>
              <strong>Enquiries that don&apos;t become projects:</strong> I
              delete them 24 months after my last contact with you.
            </li>
            <li>
              <strong>Client records:</strong> I keep them for as long as
              you&apos;re a client, plus six years after the relationship
              ends (to meet UK tax and accounting rules).
            </li>
            <li>
              <strong>Hosting logs:</strong> typically kept for up to 30
              days by Cloudflare.
            </li>
          </ul>

          <h2>7. Your rights under UK GDPR</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Ask me what personal data I hold about you.</li>
            <li>Ask me to correct something that&apos;s wrong.</li>
            <li>
              Ask me to delete your data (where I&apos;m not legally
              required to keep it).
            </li>
            <li>Ask me to stop using it for a particular purpose.</li>
            <li>Withdraw consent at any time, if consent is the basis.</li>
            <li>Receive your data in a portable format.</li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>{" "}
            and tell me which one. I&apos;ll reply within 30 days.
          </p>

          <h2>8. Complaints</h2>
          <p>
            If you think I&apos;ve mishandled your data, I&apos;d like to
            hear about it first so I can put it right. But you also have
            the right to complain to the Information Commissioner&apos;s
            Office (ICO):
          </p>
          <ul>
            <li>
              Website:{" "}
              <a
                href="https://ico.org.uk"
                target="_blank"
                rel="noopener noreferrer"
              >
                ico.org.uk
              </a>
            </li>
            <li>Phone: 0303 123 1113</li>
          </ul>

          <h2>9. Changes to this policy</h2>
          <p>
            I may update this policy from time to time — for example, if I
            change sub-processors or add a new service. If the change is
            significant, I&apos;ll put a notice on the website. The
            &quot;Last updated&quot; date at the top will always tell you when
            the policy last changed.
          </p>

          <h2>10. Contact</h2>
          <p>
            For any privacy-related question, email{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
            A proper business email address is on the way.
          </p>
        </div>
      </div>
    </section>
  );
}
