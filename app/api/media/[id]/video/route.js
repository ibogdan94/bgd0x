import { NextResponse } from "next/server";
import { getMedia, getVideoBytes, getSignedUrlFor, usingS3 } from "@/lib/media.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves the rendered MP4. On S3 (hosting) we redirect to a presigned URL so the
// browser pulls bytes straight from S3 — the SSR Lambda's ~6MB response cap can't
// carry a multi-MB video. Locally we stream the bytes.
export async function GET(request, { params }) {
  const { id } = await params;
  const item = await getMedia(id);
  if (!item || !item.videoKey) return NextResponse.json({ error: "no video" }, { status: 404 });
  try {
    if (usingS3()) {
      const url = await getSignedUrlFor(item.videoKey);
      return NextResponse.redirect(url, 302);
    }
    const bytes = await getVideoBytes(item);
    return new NextResponse(bytes, {
      headers: { "Content-Type": "video/mp4", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
