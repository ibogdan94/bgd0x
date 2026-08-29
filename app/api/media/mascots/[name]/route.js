import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSignedUrlFor, usingS3 } from "@/lib/media.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves one mascot reference still. On S3 (hosting) redirect to a presigned URL
// (with attachment disposition when ?download=1); locally read from character/.
export async function GET(request, { params }) {
  const { name } = await params;
  if (!/^[0-9]+\.png$/.test(name)) return NextResponse.json({ error: "bad name" }, { status: 400 });
  const download = new URL(request.url).searchParams.get("download");
  try {
    if (usingS3()) {
      const url = await getSignedUrlFor(`media/mascots/${name}`, download ? { downloadName: `bgd0x-mascot-${name}` } : {});
      return NextResponse.redirect(url, 302);
    }
    const bytes = readFileSync(join(process.cwd(), "character", name));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
        ...(download ? { "Content-Disposition": `attachment; filename="bgd0x-mascot-${name}"` } : {}),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}
