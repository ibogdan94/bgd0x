import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  const { email, password } = await request.json().catch(() => ({}));
  const okEmail = process.env.DASH_EMAIL;
  const okPass = process.env.DASH_PASSWORD;

  if (!okEmail || !okPass) {
    return NextResponse.json(
      { error: "Login not configured — set DASH_EMAIL and DASH_PASSWORD in .env" },
      { status: 500 }
    );
  }
  if ((email || "").trim().toLowerCase() !== okEmail.toLowerCase() || password !== okPass) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("session", await createSession(okEmail), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
