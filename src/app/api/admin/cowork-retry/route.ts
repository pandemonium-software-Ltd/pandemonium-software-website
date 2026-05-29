import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  patchChangeRequest,
  patchReviewEdit,
} from "@/lib/notion-prospects";

const schema = z.object({
  token: z.string().min(1),
  itemId: z.string().min(1),
  itemKind: z.enum(["cr", "re"]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { token, itemId, itemKind } = parsed.data;

  const prospect = await getProspectByToken(token);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const resetFields = {
    coworkClassification: undefined,
    coworkConfidence: undefined,
    coworkReasoning: undefined,
    coworkEscalatedAt: undefined,
    coworkRetriedAt: undefined,
    coworkPatches: undefined,
    coworkPatch: undefined,
    coworkPatchAppliedAt: undefined,
  };

  if (itemKind === "cr") {
    const cr = prospect.changeRequests.find((r) => r.id === itemId);
    if (!cr) {
      return NextResponse.json(
        { error: "Change request not found" },
        { status: 404 },
      );
    }
    if (cr.status === "resolved" || cr.status === "rejected" || cr.status === "retracted") {
      return NextResponse.json(
        { error: `Cannot retry a ${cr.status} request — unlock it first` },
        { status: 400 },
      );
    }
    const result = await patchChangeRequest(prospect.pageId, itemId, {
      ...resetFields,
      ...(cr.status === "in-progress" ? { status: "pending" as const } : {}),
    });
    if (!result) {
      return NextResponse.json({ error: "Notion write failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true, itemKind: "cr", itemId });
  }

  const result = await patchReviewEdit(prospect.pageId, itemId, resetFields);
  if (!result) {
    return NextResponse.json({ error: "Notion write failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true, itemKind: "re", itemId });
}
