// One-time X OAuth2 re-authorization to ADD the media.write scope (needed for
// video/image posting). Runs a loopback server to catch the callback, exchanges
// the code, and stores the new tokens in the state store (DynamoDB + .env).
//
//   node --env-file=.env scripts/reauth-x.mjs
//
// Prereq: the callback URL below must be listed in your X app's User
// authentication settings (developer.x.com → your app → Callback URI).
// Override the port/callback with CALLBACK_URL if your app uses a different one.
import http from "node:http";
import { TwitterApi } from "twitter-api-v2";
import { setTokens } from "../lib/store.mjs";

const CALLBACK = process.env.CALLBACK_URL || "http://127.0.0.1:3000/callback";
const PORT = Number(new URL(CALLBACK).port || 3000);
const SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];

if (!process.env.ClientId || !process.env.ClientSecret) throw new Error("ClientId/ClientSecret must be set in .env");

const client = new TwitterApi({ clientId: process.env.ClientId, clientSecret: process.env.ClientSecret });
const { url, codeVerifier, state } = client.generateOAuth2AuthLink(CALLBACK, { scope: SCOPES });

console.log("\n1) Open this URL in your browser and click Authorize:\n");
console.log("   " + url + "\n");
console.log(`2) After approving, X redirects to ${CALLBACK} and this script finishes.\n`);

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/callback")) { res.writeHead(404); res.end(); return; }
  const q = new URL(req.url, CALLBACK).searchParams;
  if (q.get("state") !== state) { res.writeHead(400); res.end("state mismatch"); return; }
  const code = q.get("code");
  if (!code) { res.writeHead(400); res.end("no code (denied?)"); return; }
  try {
    const { accessToken, refreshToken, scope } = await client.loginWithOAuth2({ code, codeVerifier, redirectUri: CALLBACK });
    await setTokens({ AccessToken: accessToken, RefreshToken: refreshToken });
    const ok = (scope || []).includes("media.write");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<h2>bgd0x — X re-authorized ✓</h2><p>media.write granted: <b>${ok}</b></p><p>You can close this tab.</p>`);
    console.log("\n✅ Tokens updated. Granted scopes:", (scope || []).join(", "));
    console.log("   media.write granted:", ok);
    setTimeout(() => { server.close(); process.exit(ok ? 0 : 1); }, 200);
  } catch (e) {
    res.writeHead(500); res.end("token exchange failed: " + e.message);
    console.error("token exchange failed:", e.message);
    setTimeout(() => { server.close(); process.exit(1); }, 200);
  }
});
server.listen(PORT, () => console.log(`(waiting for the callback on port ${PORT}…)\n`));
