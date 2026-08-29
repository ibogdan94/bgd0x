import { NextResponse } from "next/server";
import { MASCOT_REF_KEYS } from "@/lib/media.mjs";

export const runtime = "nodejs";

// Lists the mascot reference stills for the Media-tab gallery. Each is served by
// the /api/media/mascots/[name] route (view or ?download=1 to save).
export async function GET() {
  const mascots = MASCOT_REF_KEYS.map((k) => {
    const name = k.split("/").pop();
    return { name, src: `/api/media/mascots/${name}`, download: `/api/media/mascots/${name}?download=1` };
  });
  return NextResponse.json({ mascots });
}
