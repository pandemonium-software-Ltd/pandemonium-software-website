// /book is now a permalink that redirects to the unified
// /contact#book section. The booking embed lives on the contact
// page so customers see all "ways to reach us" in one place.
// Old links (emails, business cards) keep working — they bounce
// to the right anchor.

import { redirect } from "next/navigation";

export default function BookPage() {
  redirect("/contact#book");
}
