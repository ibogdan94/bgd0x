import { NextResponse } from "next/server";
import { getMedia, getImageBytes, getSignedUrlFor, usingS3 } from "@/lib/media.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves the source image for Media-tab previews. On S3 we redirect to a
// presigned URL (same Lambda-response-cap reason as the video route); locally we
// stream the bytes.
export async function GET(request, { params }) {
  const { id } = await params;
  const item = await getMedia(id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    if (usingS3()) {
      const key = item.key || `media/${item.id}.${item.ext || "png"}`;
      const url = await getSignedUrlFor(key);
      return NextResponse.redirect(url, 302);
    }
    const bytes = await getImageBytes(item);
    return new NextResponse(bytes, {
      headers: { "Content-Type": item.contentType || "image/png", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
