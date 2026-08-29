import { NextResponse } from "next/server";
import { getMedia, updateMedia } from "@/lib/store.mjs";

export const runtime = "nodejs";

// Toggle whether a rendered clip is queued for the weekly post. A "queued" clip
// (with a stored render) is posted first by the weekly job, before it falls back
// to auto-generating a fresh one. Body: { queued: true|false }.
export async function POST(request, { params }) {
  const { id } = await params;
  try {
    const item = await getMedia(id);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (item.status === "used") return NextResponse.json({ error: "already posted" }, { status: 400 });
    const { queued } = await request.json().catch(() => ({ queued: true }));
    if (queued && !item.videoKey) return NextResponse.json({ error: "render a preview first" }, { status: 400 });
    await updateMedia(id, { status: queued ? "queued" : "preview" });
    return NextResponse.json({ ok: true, status: queued ? "queued" : "preview" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
