import { readFileSync, writeFileSync } from "node:fs";
import { TwitterApi } from "twitter-api-v2";

const ENV_PATH = new URL("../.env", import.meta.url);

// Rewrite specific KEY=VALUE lines in .env, preserving comments/order.
export function updateEnv(patch) {
  let text = readFileSync(ENV_PATH, "utf8");
  for (const [key, value] of Object.entries(patch)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) text = text.replace(re, `${key}=${value}`);
    else text += `\n${key}=${value}`;
    process.env[key] = value;
  }
  writeFileSync(ENV_PATH, text);
}

// Post a tweet with the current OAuth2 access token.
// On expiry (401), refresh via the single-use refresh token, persist the new
// tokens back to .env, and retry once.
export async function postTweet(text) {
  const doTweet = async (token) => (await new TwitterApi(token).v2.tweet(text)).data;

  try {
    return await doTweet(process.env.AccessToken);
  } catch (err) {
    const code = err?.code || err?.data?.status;
    if (code !== 401) throw err;

    const refresher = new TwitterApi({
      clientId: process.env.ClientId,
      clientSecret: process.env.ClientSecret,
    });
    const { accessToken, refreshToken } = await refresher.refreshOAuth2Token(
      process.env.RefreshToken
    );
    updateEnv({ AccessToken: accessToken, RefreshToken: refreshToken });
    return await doTweet(accessToken);
  }
}
