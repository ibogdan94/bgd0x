import { NextResponse } from "next/server";
import { getMedia } from "@/lib/media.mjs";
import { renderPreview } from "@/lib/tasks.mjs";

export const runtime = "nodejs";
export const maxDuration = 300; // rendering can take minutes

// Render a preview clip for one image/scene WITHOUT posting to X. Stores the MP4
// + caption on the item (status "preview") so it appears in the Media tab.
export async function POST(request, { params }) {
  const { id } = await params;
  try {
    const item = await getMedia(id);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    const res = await renderPreview(item);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
