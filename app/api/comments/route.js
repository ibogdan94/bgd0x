import { NextResponse } from "next/server";
import { listComments, listTargets, addTarget, removeTarget, capInfo } from "@/lib/comments.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [comments, targets, cap] = await Promise.all([listComments(), listTargets(), capInfo()]);
  return NextResponse.json({ comments, targets, ...cap });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    if (body.addTarget?.handle) {
      const t = await addTarget(body.addTarget.handle, body.addTarget.category || "other");
      return NextResponse.json({ ok: true, target: t });
    }
    if (body.removeTarget) {
      await removeTarget(body.removeTarget);
      return NextResponse.json({ ok: true, removed: true });
    }
    return NextResponse.json({ error: "no action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
