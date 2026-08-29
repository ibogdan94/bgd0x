import { NextResponse } from "next/server";
import { TwitterApi } from "twitter-api-v2";
import { setTokens } from "@/lib/store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// X OAuth2 redirect target (registered callback). Exchanges the code for tokens
// using the PKCE verifier from the cookie and stores them (DynamoDB/.env).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const raw = request.cookies.get("x_oauth")?.value;
  if (!code || !raw) return new NextResponse("Missing code or expired session — start again at /api/auth/x/start", { status: 400 });

  let saved;
  try { saved = JSON.parse(raw); } catch { return new NextResponse("Bad oauth cookie", { status: 400 }); }
  if (!state || state !== saved.state) return new NextResponse("State mismatch", { status: 400 });

  const callback = process.env.X_CALLBACK_URL || "https://bgd0x.com/callback";
  const client = new TwitterApi({ clientId: process.env.ClientId, clientSecret: process.env.ClientSecret });
  try {
    const { accessToken, refreshToken, scope } = await client.loginWithOAuth2({
      code, codeVerifier: saved.codeVerifier, redirectUri: callback,
    });
    await setTokens({ AccessToken: accessToken, RefreshToken: refreshToken });
    const ok = (scope || []).includes("media.write");
    const res = NextResponse.redirect(new URL(`/media?xauth=${ok ? "ok" : "noscope"}`, request.url));
    res.cookies.set("x_oauth", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return new NextResponse("Token exchange failed: " + err.message, { status: 500 });
  }
}
