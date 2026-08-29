import { NextResponse } from "next/server";
import { removeSource } from "@/lib/sources.mjs";

export const runtime = "nodejs";

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await removeSource(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
