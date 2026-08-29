import { NextResponse } from "next/server";
import { getMedia, getVideoBytes } from "@/lib/media.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streams the rendered MP4 so the Media tab can play it back.
export async function GET(request, { params }) {
  const { id } = await params;
  const item = await getMedia(id);
  if (!item || !item.videoKey) return NextResponse.json({ error: "no video" }, { status: 404 });
  try {
    const bytes = await getVideoBytes(item);
    return new NextResponse(bytes, {
      headers: { "Content-Type": "video/mp4", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
