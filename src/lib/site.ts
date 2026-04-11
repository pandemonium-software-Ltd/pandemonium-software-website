export const site = {
  name: "Pandemonium Software Ltd",
  shortName: "Pandemonium",
  tagline: "Software Ltd",
  url: "https://pandemonium-software-website.benpandher.workers.dev",
  description:
    "Professional websites for UK trades and small businesses. Proudly Oxfordshire-based, serving the UK. No hassle, no tech headaches, just a site that brings in work.",
  contactEmail: "benpandher@proton.me",
  contactPath: "/contact",
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
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
} as const;
