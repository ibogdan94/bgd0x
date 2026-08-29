// Edge-compatible session tokens (Web Crypto only — no Node APIs, so it works
// in both middleware and route handlers). Token = base64(email).hmac(base64(email)).
const enc = new TextEncoder();

const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(msg) {
  const secret = process.env.AUTH_SECRET || "dev-insecure-secret";
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

export async function createSession(email) {
  const payload = btoa(email);
  return `${payload}.${await sign(payload)}`;
}

export async function verifySession(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (sig !== (await sign(payload))) return null;
  try { return atob(payload); } catch { return null; }
}
