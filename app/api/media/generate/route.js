import { NextResponse } from "next/server";
import { generateMascotPreview } from "@/lib/tasks.mjs";

export const runtime = "nodejs";
export const maxDuration = 300; // rendering can take minutes

// Text -> mascot video. The mascot stills are ALWAYS attached as the BFL
// reference, so whatever you type, the clip stays on-brand. Saves a preview
// (no post) that shows in the Media tab.
export async function POST(request) {
  try {
    const { text } = await request.json().catch(() => ({}));
    const res = await generateMascotPreview((text || "").toString().slice(0, 500));
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
