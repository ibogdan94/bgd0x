// Post a tweet using an OAuth 2.0 user-context access token.
// Auto-refreshes the token if it has expired (using RefreshToken + client creds).
// Usage:  node --env-file=.env tweet-oauth2.mjs "your text"
import { TwitterApi } from "twitter-api-v2";

const text = process.argv[2] || "Hello world — my first tweet via the API 🚀";
const { AccessToken, RefreshToken, ConsumerKey, SecretKey } = process.env;

async function tryTweet(token) {
  const client = new TwitterApi(token);
  return client.v2.tweet(text);
}

try {
  const { data } = await tryTweet(AccessToken);
  console.log(`\n✅ Posted: https://x.com/i/status/${data.id}\n`);
} catch (err) {
  const code = err?.code || err?.data?.status;
  // 401 => access token likely expired; try refreshing.
  if ((code === 401 || code === 403) && RefreshToken) {
    console.log("Access token rejected, attempting refresh…");
    try {
      const refresher = new TwitterApi({
        clientId: process.env.ClientId || ConsumerKey,
        clientSecret: process.env.ClientSecret || SecretKey,
      });
      const { accessToken, refreshToken } = await refresher.refreshOAuth2Token(
        RefreshToken
      );
      const { data } = await tryTweet(accessToken);
      console.log(`\n✅ Posted (after refresh): https://x.com/i/status/${data.id}`);
      console.log("\n🔑 New tokens (update .env):");
      console.log("AccessToken=" + accessToken);
      console.log("RefreshToken=" + refreshToken + "\n");
    } catch (e2) {
      console.error("\n❌ Refresh failed:", e2?.data || e2?.message || e2, "\n");
      process.exit(1);
    }
  } else {
    console.error("\n❌ Failed:", err?.data || err?.message || err, "\n");
    process.exit(1);
  }
}
