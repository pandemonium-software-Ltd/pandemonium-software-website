import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveException } from "@/lib/notion-ops";

export const runtime = "nodejs";

const schema = z.object({
  exceptionId: z.string().min(1),
  resolutionNotes: z.string().trim().min(1).max(2000),
});

export async function PATCH(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  try {
    await resolveException(parsed.data.exceptionId, parsed.data.resolutionNotes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/admin/resolve-exception]", msg);
    return NextResponse.json({ error: "Failed to resolve." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
