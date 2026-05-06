export const site = {
  name: "Pandamonium Software Ltd",
  shortName: "Pandamonium",
  tagline: "Software Ltd",
  // The technical worker URL stays on the old spelling for now — renaming
  // the worker would break previously-emailed Hub / Intake / Pay links.
  // Once a custom domain is registered, swap this for the canonical URL.
  url: "https://pandemonium-software-website.benpandher.workers.dev",
  description:
    "Professional websites for UK trades and small businesses. Proudly Oxfordshire-based, serving the UK. No hassle, no tech headaches, just a site that brings in work.",
  contactEmail: "pandamoniumsoftwareltd@gmail.com",
  enquiryPath: "/enquiry",
  demoUrl: "https://oxford-garden-co-demo.vercel.app",
  location: {
    city: "Oxford",
    region: "Oxfordshire",
    country: "United Kingdom",
    countryCode: "GB",
  },
  nav: [
    { label: "Pricing", href: "/pricing" },
    { label: "About", href: "/about" },
  ],
  footerNav: [
    { label: "Pricing", href: "/pricing" },
    { label: "About", href: "/about" },
    { label: "Start your enquiry", href: "/enquiry" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
} as const;
