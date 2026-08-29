import { NextResponse } from "next/server";
import { listSources, addSource } from "@/lib/sources.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sources: await listSources() });
}

export async function POST(request) {
  try {
    const { type, value, label } = await request.json();
    if (!value || !value.trim()) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }
    if (type === "rss" && !/^https?:\/\//i.test(value.trim())) {
      return NextResponse.json({ error: "RSS source must be a URL" }, { status: 400 });
    }
    const source = await addSource({ type, value, label });
    return NextResponse.json({ ok: true, source });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
