// Deterministic patch builder for form-generated change requests.
//
// When the customer uses a structured form (edit, add, remove), we can
// skip Haiku entirely and build the exact patches the applier needs.
// This eliminates the Haiku API cost, latency, and misclassification
// risk for all form-generated requests. Only truly free-text messages
// (typed into the "describe your change" box) need AI classification.

import type { SafeTarget } from "../haiku/classify-change-request";

export type FormPatch = {
  target: SafeTarget;
  newValue: string;
  serviceName?: string;
  faqQuestion?: string;
  testimonialName?: string;
  locationName?: string;
};

type EditFieldMap = {
  field: string;
  newValue: string;
  category: string;
  serviceName?: string;
  faqQuestion?: string;
  testimonialName?: string;
  locationName?: string;
  hours?: Record<string, { open: boolean; from: string; to: string }>;
};

export function buildEditPatches(args: EditFieldMap): FormPatch[] | null {
  const { field, newValue, category, serviceName, faqQuestion, testimonialName, locationName, hours } = args;

  if (field === "phone") {
    if (locationName) {
      return [
        { target: "locations.phoneDisplay", newValue, locationName },
        { target: "locations.phoneTel", newValue: toTelFormat(newValue), locationName },
      ];
    }
    return [
      { target: "business.phoneDisplay", newValue },
      { target: "business.phoneTel", newValue: toTelFormat(newValue) },
    ];
  }
  if (field === "email") {
    if (locationName) return [{ target: "locations.publicEmail", newValue, locationName }];
    return [{ target: "business.publicEmail", newValue }];
  }
  if (field === "address") {
    if (locationName) return [{ target: "locations.address", newValue, locationName }];
    return [{ target: "business.address", newValue }];
  }
  if (field === "serviceArea") return [{ target: "business.serviceArea", newValue }];
  if (field === "openingHours" && hours) {
    const target: SafeTarget = locationName ? "locations.openingHours" : "business.openingHours";
    return [{ target, newValue: JSON.stringify(hours), locationName }];
  }
  if (field === "tagline") return [{ target: "copy.tagline", newValue }];
  if (field === "aboutBlurb") return [{ target: "copy.aboutBlurb", newValue }];
  if (field === "contactName") return [{ target: "business.contactName", newValue }];

  if (category === "service" && serviceName) {
    if (field === "serviceDesc") return [{ target: "content.services.description", newValue, serviceName }];
    if (field === "serviceLongDesc") return [{ target: "content.services.longDescription", newValue, serviceName }];
    if (field === "servicePricing") return [{ target: "content.services.pricingNotes", newValue, serviceName }];
    if (field === "servicePrice") return [{ target: "content.services.priceFrom", newValue, serviceName }];
  }
  if (category === "faq" && faqQuestion) {
    if (field === "faqQuestion") return [{ target: "content.faq.question", newValue, faqQuestion }];
    if (field === "faqAnswer") return [{ target: "content.faq.answer", newValue, faqQuestion }];
  }
  if (category === "testimonial" && testimonialName) {
    if (field === "testimonialQuote") return [{ target: "content.testimonials.quote", newValue, testimonialName }];
    if (field === "testimonialRating") return [{ target: "content.testimonials.rating", newValue, testimonialName }];
  }
  if (field === "trustYears") return [{ target: "content.trust.yearsExperience", newValue }];
  if (field === "trustAssociations") return [{ target: "content.trust.associations", newValue }];
  if (field === "trustAwards") return [{ target: "content.trust.awards", newValue }];

  return null;
}

export function buildAddPatches(args: {
  category: string;
  service?: { name: string; description?: string; pricingNotes?: string; priceFrom?: string };
  faq?: { question: string; answer: string };
  testimonial?: { name: string; quote: string; rating?: string };
}): FormPatch[] | null {
  if (args.category === "service" && args.service) {
    const obj: Record<string, string> = { serviceName: args.service.name };
    if (args.service.description) obj.description = args.service.description;
    if (args.service.pricingNotes) obj.pricingNotes = args.service.pricingNotes;
    if (args.service.priceFrom) obj.priceFrom = args.service.priceFrom;
    return [{ target: "content.services.add", newValue: JSON.stringify(obj) }];
  }
  if (args.category === "faq" && args.faq) {
    return [{ target: "content.faq.add", newValue: JSON.stringify(args.faq) }];
  }
  if (args.category === "testimonial" && args.testimonial) {
    const obj: Record<string, string> = { name: args.testimonial.name, quote: args.testimonial.quote };
    if (args.testimonial.rating) obj.rating = args.testimonial.rating;
    return [{ target: "content.testimonials.add", newValue: JSON.stringify(obj) }];
  }
  return null;
}

export function buildRemovePatches(args: {
  category: string;
  serviceName?: string;
  faqQuestion?: string;
  testimonialName?: string;
}): FormPatch[] | null {
  if (args.category === "service" && args.serviceName) {
    return [{ target: "content.services.remove", newValue: "remove", serviceName: args.serviceName }];
  }
  if (args.category === "faq" && args.faqQuestion) {
    return [{ target: "content.faq.remove", newValue: "remove", faqQuestion: args.faqQuestion }];
  }
  if (args.category === "testimonial" && args.testimonialName) {
    return [{ target: "content.testimonials.remove", newValue: "remove", testimonialName: args.testimonialName }];
  }
  return null;
}

// Deterministic message parser — extracts patches from form-generated
// messages that are already in the queue (submitted before this code
// was deployed). Matches the exact format that buildMessage() produces.
// Returns null for free-text that doesn't match any known pattern.
export function parseFormMessage(
  message: string,
  siteSnapshot?: { services?: Array<{ name: string }>; faq?: Array<{ question: string }>; testimonials?: Array<{ name: string }> },
): FormPatch[] | null {
  // --- Add patterns ---
  const addServiceMatch = message.match(/^Add new service: "(.+?)"/);
  if (addServiceMatch) {
    const obj: Record<string, string> = { serviceName: addServiceMatch[1]! };
    const descMatch = message.match(/Description: "(.+?)"/);
    if (descMatch) obj.description = descMatch[1]!;
    const pricingMatch = message.match(/Pricing notes: "(.+?)"/);
    if (pricingMatch) obj.pricingNotes = pricingMatch[1]!;
    const priceMatch = message.match(/Price from: (\S+)/);
    if (priceMatch) obj.priceFrom = priceMatch[1]!;
    return [{ target: "content.services.add", newValue: JSON.stringify(obj) }];
  }

  const addFaqMatch = message.match(/^Add new FAQ:\nQuestion: "(.+?)"\nAnswer: "(.+?)"/s);
  if (addFaqMatch) {
    return [{ target: "content.faq.add", newValue: JSON.stringify({ question: addFaqMatch[1]!, answer: addFaqMatch[2]! }) }];
  }

  const addTestMatch = message.match(/^Add new testimonial by "(.+?)"\nQuote: "(.+?)"/s);
  if (addTestMatch) {
    const obj: Record<string, string> = { name: addTestMatch[1]!, quote: addTestMatch[2]! };
    const ratingMatch = message.match(/Rating: (\d)/);
    if (ratingMatch) obj.rating = ratingMatch[1]!;
    return [{ target: "content.testimonials.add", newValue: JSON.stringify(obj) }];
  }

  // --- Remove patterns ---
  const removeServiceMatch = message.match(/^Remove service: "(.+?)"/);
  if (removeServiceMatch) {
    return [{ target: "content.services.remove", newValue: "remove", serviceName: removeServiceMatch[1]! }];
  }

  const removeFaqMatch = message.match(/^Remove FAQ: "(.+?)"/);
  if (removeFaqMatch) {
    return [{ target: "content.faq.remove", newValue: "remove", faqQuestion: removeFaqMatch[1]! }];
  }

  const removeTestMatch = message.match(/^Remove testimonial by "(.+?)"/);
  if (removeTestMatch) {
    return [{ target: "content.testimonials.remove", newValue: "remove", testimonialName: removeTestMatch[1]! }];
  }

  // --- Edit patterns ---
  const phoneMatch = message.match(/^(?:For (.+?): )?Change phone number to: (.+)$/);
  if (phoneMatch) {
    const loc = phoneMatch[1];
    const val = phoneMatch[2]!;
    if (loc) return [
      { target: "locations.phoneDisplay", newValue: val, locationName: loc },
      { target: "locations.phoneTel", newValue: toTelFormat(val), locationName: loc },
    ];
    return [
      { target: "business.phoneDisplay", newValue: val },
      { target: "business.phoneTel", newValue: toTelFormat(val) },
    ];
  }

  const emailMatch = message.match(/^(?:For (.+?): )?Change email address to: (.+)$/);
  if (emailMatch) {
    const loc = emailMatch[1];
    const val = emailMatch[2]!;
    if (loc) return [{ target: "locations.publicEmail", newValue: val, locationName: loc }];
    return [{ target: "business.publicEmail", newValue: val }];
  }

  const addressMatch = message.match(/^(?:For (.+?): )?Change address to: "(.+?)"$/);
  if (addressMatch) {
    const loc = addressMatch[1];
    const val = addressMatch[2]!;
    if (loc) return [{ target: "locations.address", newValue: val, locationName: loc }];
    return [{ target: "business.address", newValue: val }];
  }

  const serviceAreaMatch = message.match(/^Change service area to: "(.+?)"$/);
  if (serviceAreaMatch) return [{ target: "business.serviceArea", newValue: serviceAreaMatch[1]! }];

  const taglineMatch = message.match(/^Change tagline to: "(.+?)"$/);
  if (taglineMatch) return [{ target: "copy.tagline", newValue: taglineMatch[1]! }];

  const aboutMatch = message.match(/^Change about blurb to: "(.+?)"$/s);
  if (aboutMatch) return [{ target: "copy.aboutBlurb", newValue: aboutMatch[1]! }];

  // Opening hours
  const hoursMatch = message.match(/^(?:For (.+?): )?Change opening hours to:\n([\s\S]+)$/);
  if (hoursMatch) {
    const loc = hoursMatch[1];
    const hoursText = hoursMatch[2]!;
    const parsed = parseHoursFromMessage(hoursText);
    if (parsed) {
      const target: SafeTarget = loc ? "locations.openingHours" : "business.openingHours";
      return [{ target, newValue: JSON.stringify(parsed), locationName: loc }];
    }
  }

  // Per-service edit
  const svcEditMatch = message.match(/^For service "(.+?)": Change (.+?) to: "?(.+?)"?$/s);
  if (svcEditMatch) {
    const svcName = svcEditMatch[1]!;
    const fieldLabel = svcEditMatch[2]!;
    let val = svcEditMatch[3]!;
    if (val.endsWith('"')) val = val.slice(0, -1);
    let target: SafeTarget | null = null;
    if (fieldLabel === "short description") target = "content.services.description";
    else if (fieldLabel === "long description") target = "content.services.longDescription";
    else if (fieldLabel === "pricing notes") target = "content.services.pricingNotes";
    else if (fieldLabel === "price from") target = "content.services.priceFrom";
    if (target) return [{ target, newValue: val, serviceName: svcName }];
  }

  // Per-FAQ edit
  const faqEditMatch = message.match(/^For FAQ "(.+?)": Change (.+?) to: "(.+?)"$/s);
  if (faqEditMatch) {
    const q = faqEditMatch[1]!;
    const fieldLabel = faqEditMatch[2]!;
    const val = faqEditMatch[3]!;
    if (fieldLabel === "question") return [{ target: "content.faq.question", newValue: val, faqQuestion: q }];
    if (fieldLabel === "answer") return [{ target: "content.faq.answer", newValue: val, faqQuestion: q }];
  }

  // Per-testimonial edit
  const testEditMatch = message.match(/^For testimonial by "(.+?)": Change (.+?) to: "?(.+?)"?$/s);
  if (testEditMatch) {
    const tName = testEditMatch[1]!;
    const fieldLabel = testEditMatch[2]!;
    let val = testEditMatch[3]!;
    if (val.endsWith('"')) val = val.slice(0, -1);
    if (fieldLabel === "quote") return [{ target: "content.testimonials.quote", newValue: val, testimonialName: tName }];
    if (fieldLabel === "rating") return [{ target: "content.testimonials.rating", newValue: val, testimonialName: tName }];
  }

  // Trust signals
  const trustYearsMatch = message.match(/^Change years of experience to: (\d+)$/);
  if (trustYearsMatch) return [{ target: "content.trust.yearsExperience", newValue: trustYearsMatch[1]! }];

  const trustAssocMatch = message.match(/^Change associations\/memberships to: "(.+?)"$/);
  if (trustAssocMatch) return [{ target: "content.trust.associations", newValue: trustAssocMatch[1]! }];

  const trustAwardsMatch = message.match(/^Change awards\/accreditations to: "(.+?)"$/);
  if (trustAwardsMatch) return [{ target: "content.trust.awards", newValue: trustAwardsMatch[1]! }];

  // Photo/asset — rebuildOnly (no patches, asset already uploaded)
  if (message.startsWith("Replace ") && message.includes("with uploaded image:")) {
    return [];
  }

  return null;
}

function toTelFormat(phone: string): string {
  return phone.replace(/[\s()-]/g, "").replace(/^0/, "+44");
}

function parseHoursFromMessage(text: string): Record<string, { open: boolean; from?: string; to?: string }> | null {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const result: Record<string, { open: boolean; from?: string; to?: string }> = {};
  const lines = text.trim().split("\n");
  for (const line of lines) {
    const match = line.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun): (.+)$/);
    if (!match) continue;
    const day = match[1]!;
    const val = match[2]!;
    if (val === "Closed") {
      result[day] = { open: false };
    } else {
      const timeMatch = val.match(/^(\d{2}:\d{2})[–-](\d{2}:\d{2})$/);
      if (timeMatch) {
        result[day] = { open: true, from: timeMatch[1]!, to: timeMatch[2]! };
      }
    }
  }
  if (Object.keys(result).length === 0) return null;
  for (const d of days) {
    if (!result[d]) result[d] = { open: false };
  }
  return result;
}
