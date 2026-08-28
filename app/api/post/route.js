import { NextResponse } from "next/server";
import { getTwitterClient } from "@/lib/twitter";

export async function POST(request) {
  try {
    const { text } = await request.json();

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const client = getTwitterClient();
    const { data } = await client.v2.tweet(text);

    return NextResponse.json({
      success: true,
      id: data.id,
      url: `https://x.com/i/status/${data.id}`,
    });
  } catch (err) {
    console.error("Post failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to post" },
      { status: 500 }
    );
  }
}
