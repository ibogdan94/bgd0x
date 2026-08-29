import { NextResponse } from "next/server";
import { postCommentNow, skipComment } from "@/lib/comments.mjs";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { id } = await params;
  const { action } = await request.json();
  try {
    if (action === "post") return NextResponse.json({ ok: true, ...(await postCommentNow(id)) });
    if (action === "skip") { await skipComment(id); return NextResponse.json({ ok: true, skipped: true }); }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
