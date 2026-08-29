import { NextResponse } from "next/server";
import { TwitterApi } from "twitter-api-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Begin X OAuth2 (re)authorization with the media.write scope (needed to post
// videos/images). Stores the PKCE verifier + state in a short-lived cookie and
// redirects to X. The /callback route completes it.
export async function GET() {
  const callback = process.env.X_CALLBACK_URL || "https://bgd0x.com/callback";
  const client = new TwitterApi({ clientId: process.env.ClientId, clientSecret: process.env.ClientSecret });
  const { url, codeVerifier, state } = client.generateOAuth2AuthLink(callback, {
    scope: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"],
  });
  const res = NextResponse.redirect(url);
  res.cookies.set("x_oauth", JSON.stringify({ codeVerifier, state }), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600,
  });
  return res;
}
