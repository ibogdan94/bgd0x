import { NextResponse } from "next/server";
import { listPending } from "@/lib/drafts.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ drafts: await listPending() });
}
