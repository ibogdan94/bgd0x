import { NextResponse } from "next/server";
import { getMedia, getImageBytes } from "@/lib/media.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves the raw image bytes for previews in the Media tab.
export async function GET(request, { params }) {
  const { id } = await params;
  const item = await getMedia(id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const bytes = await getImageBytes(item);
    return new NextResponse(bytes, {
      headers: { "Content-Type": item.contentType || "image/png", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
