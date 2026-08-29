import { NextResponse } from "next/server";
import { removeMedia } from "@/lib/media.mjs";

export const runtime = "nodejs";

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await removeMedia(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
