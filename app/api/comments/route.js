import { NextResponse } from "next/server";
import { listComments, capInfo } from "@/lib/comments.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [comments, cap] = await Promise.all([listComments(), capInfo()]);
  return NextResponse.json({ comments, ...cap });
}
