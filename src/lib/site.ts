export const site = {
  name: "Pandemonium Software Ltd",
  shortName: "Pandemonium",
  tagline: "Software Ltd",
  url: "https://pandemonium-software-website.vercel.app",
  description:
    "Professional websites for Oxfordshire tradesmen. No hassle, no tech headaches, just a site that brings in work.",
  contactEmail: "benpandher@proton.me",
  bookingUrl: "https://cal.com/pandemonium-software-ltd-67ydfj/30min",
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
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
} as const;
