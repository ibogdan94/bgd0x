import { NextResponse } from "next/server";
import { approveDraft, rejectDraft } from "@/lib/drafts.mjs";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { id } = await params;
  const { action } = await request.json();

  try {
    if (action === "approve") {
      const result = await approveDraft(id);
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "reject") {
      rejectDraft(id);
      return NextResponse.json({ ok: true, rejected: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
