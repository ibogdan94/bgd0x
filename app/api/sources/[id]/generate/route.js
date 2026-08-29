import { NextResponse } from "next/server";
import { getSource, generateFromSource } from "@/lib/sources.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  const { id } = await params;
  try {
    const source = await getSource(id);
    if (!source) return NextResponse.json({ error: "source not found" }, { status: 404 });

    let n = 5;
    try {
      const body = await request.json();
      if (body?.count) n = Math.max(1, Math.min(10, Number(body.count) || 5));
    } catch {}

    const added = await generateFromSource(source, n);
    return NextResponse.json({ ok: true, added });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
