import { NextResponse } from "next/server";
import { listMedia, saveImage } from "@/lib/media.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const media = (await listMedia()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return NextResponse.json({ media });
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const contentType = file.type || "image/png";
    if (!/^image\//.test(contentType)) {
      return NextResponse.json({ error: "only image uploads are allowed" }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const label = form.get("label") || null;
    const rec = await saveImage(bytes, { contentType, label });
    return NextResponse.json({ ok: true, media: rec });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
