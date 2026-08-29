import { NextResponse } from "next/server";
import { getMedia } from "@/lib/media.mjs";
import { renderAndPost } from "@/lib/tasks.mjs";

export const runtime = "nodejs";
export const maxDuration = 300; // rendering can take minutes

// Manual "animate & post now" for a single image (bypasses window/cap).
export async function POST(request, { params }) {
  const { id } = await params;
  try {
    const item = await getMedia(id);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (item.status === "used") return NextResponse.json({ error: "already used" }, { status: 400 });
    const res = await renderAndPost(item);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
