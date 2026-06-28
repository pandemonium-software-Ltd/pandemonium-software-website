import type { GuideStep } from "@/components/onboarding/StepGuide";

export const STEP1_GUIDE: GuideStep[] = [
  {
    selector: "[data-guide='step1-instructions']",
    title: "Follow the numbered steps",
    description:
      "Work through each step in order. You'll sign up for Cloudflare, skip their setup screens, then invite us as a team member.",
    side: "bottom",
  },
  {
    selector: "[data-guide='step1-invite-email']",
    title: "Copy this email",
    description:
      "Click 'Copy' and paste this into Cloudflare's invite form. This is the email you add as an Administrator.",
    side: "top",
  },
  {
    selector: "[data-guide='step1-your-email']",
    title: "Enter your Cloudflare email",
    description:
      "Type the email address you used to sign up at Cloudflare. This tells us whose invitation to look for in our inbox.",
    side: "top",
  },
  {
    selector: "[data-guide='step1-done-btn']",
    title: "Mark it done when you're finished",
    description:
      "Once you've sent the invite and entered your email above, click here to complete this step. You can always come back to edit later.",
    side: "top",
  },
];

export const STEP2_GUIDE: GuideStep[] = [
  {
    selector: "[data-guide='step2-domain-input']",
    title: "Enter your domain",
    description:
      "Type just the bare domain — like yourbusiness.co.uk — without https:// or www.",
    side: "bottom",
  },
  {
    selector: "[data-guide='step2-registrar-options']",
    title: "Tell us where your domain is registered",
    description:
      "Pick the option that matches your situation. If you're not sure, 'I already have my domain' is most common. We recommend Cloudflare if you haven't bought one yet.",
    side: "bottom",
  },
  {
    selector: "[data-guide='step2-done-btn']",
    title: "Mark it done",
    description:
      "Once you've entered your domain and chosen your registrar, click here. We'll take it from here — you'll get an email with any next steps.",
    side: "top",
  },
];

export const STEP3_GUIDE: GuideStep[] = [
  {
    selector: "[data-guide='step3-modules']",
    title: "Your purchased modules",
    description:
      "Each card is a module you've bought. Green means it's set up, amber means it needs attention, red means it hasn't been started yet.",
    side: "bottom",
  },
  {
    selector: "[data-guide='step3-done-btn']",
    title: "Mark done when all modules are green",
    description:
      "Once every module card shows a green tick, you can mark this step done. Don't worry if you get stuck — reply to any of our emails for help.",
    side: "top",
  },
];

export const STEP4_CONTENT_GUIDE: GuideStep[] = [
  {
    selector: "[data-guide='step4-content-sections']",
    title: "Fill in your site content",
    description:
      "Work through each section — business details, services, testimonials, and more. Your Phase 3 answers are pre-filled where possible.",
    side: "bottom",
  },
  {
    selector: "[data-guide='step4-content-save']",
    title: "Save as you go",
    description:
      "Your progress saves automatically when you click 'Save progress'. You can leave and come back any time — nothing is lost.",
    side: "top",
  },
];

export const STEP4_ASSETS_GUIDE: GuideStep[] = [
  {
    selector: "[data-guide='step4-assets-upload']",
    title: "Upload your brand assets",
    description:
      "Upload your logo, hero image, about photo, and any service photos. Drag and drop or click to browse. Max 5 MB per file.",
    side: "bottom",
  },
  {
    selector: "[data-guide='step4-assets-done-btn']",
    title: "Mark done when your uploads look right",
    description:
      "You can come back to swap images later — this step stays editable even after marking it done.",
    side: "top",
  },
];

export const STEP5_GUIDE: GuideStep[] = [
  {
    selector: "[data-guide='step5-preview']",
    title: "Review your site preview",
    description:
      "This is how your site will look. Check everything carefully — your business details, services, and photos.",
    side: "bottom",
  },
  {
    selector: "[data-guide='step5-edits']",
    title: "Request changes if needed",
    description:
      "Spot something wrong? Use the edit box to describe what you'd like changed. We'll apply it and show you an updated preview.",
    side: "top",
  },
];

/**
 * Video tutorial configuration. Keys map to R2 paths.
 *
 * To add a video:
 * 1. Upload to R2: `wrangler r2 object put moduforge-customer-assets/tutorials/<key>.mp4 --file <path> --remote`
 * 2. Set the URL here using R2_PUBLIC_URL_BASE + path
 *
 * Poster images are optional — the player shows a gradient placeholder
 * without one. If you want posters, upload as .jpg alongside the .mp4.
 */
export type VideoTutorialConfig = {
  src: string;
  poster?: string;
  title: string;
  caption?: string;
};

export function getTutorialVideos(r2Base: string): Record<string, VideoTutorialConfig> {
  const base = r2Base.replace(/\/$/, "");
  if (!base) return {};

  return {
    "cloudflare-signup": {
      src: `${base}/tutorials/cloudflare-signup.mp4`,
      title: "Watch: Setting up your Cloudflare account",
      caption: "2 min — covers sign-up, skipping setup screens, and inviting a team member.",
    },
    "godaddy-nameservers": {
      src: `${base}/tutorials/godaddy-nameservers.mp4`,
      title: "Watch: Changing nameservers on GoDaddy",
      caption: "1 min — where to find the nameserver setting and how to paste the new values.",
    },
    "123reg-nameservers": {
      src: `${base}/tutorials/123reg-nameservers.mp4`,
      title: "Watch: Changing nameservers on 123-reg",
      caption: "1 min — step-by-step nameserver change in the 123-reg control panel.",
    },
    "namecheap-nameservers": {
      src: `${base}/tutorials/namecheap-nameservers.mp4`,
      title: "Watch: Changing nameservers on Namecheap",
      caption: "1 min — switching from BasicDNS to custom nameservers.",
    },
    "gbp-share-link": {
      src: `${base}/tutorials/gbp-share-link.mp4`,
      title: "Watch: Getting your Google Business Profile link",
      caption: "1 min — search on Google Maps, click Share, copy the link.",
    },
    "gbp-add-manager": {
      src: `${base}/tutorials/gbp-add-manager.mp4`,
      title: "Watch: Adding a manager to your Google Business Profile",
      caption: "1 min — how to invite us as a manager from the GBP dashboard.",
    },
  };
}
