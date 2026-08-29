import { TwitterApi } from "twitter-api-v2";
import { getTokens, setTokens } from "./store.mjs";

// Post a tweet using the stored OAuth2 access token. On expiry (401), refresh
// via the single-use refresh token, persist the new pair to the store, retry once.
export async function postTweet(text) {
  const doTweet = async (token) => (await new TwitterApi(token).v2.tweet(text)).data;

  const { AccessToken } = await getTokens();
  try {
    return await doTweet(AccessToken);
  } catch (err) {
    const code = err?.code || err?.data?.status;
    if (code !== 401) throw err;

    const { RefreshToken } = await getTokens();
    const refresher = new TwitterApi({
      clientId: process.env.ClientId,
      clientSecret: process.env.ClientSecret,
    });
    const { accessToken, refreshToken } = await refresher.refreshOAuth2Token(RefreshToken);
    await setTokens({ AccessToken: accessToken, RefreshToken: refreshToken });
    return await doTweet(accessToken);
  }
}
