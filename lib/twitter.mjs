import { TwitterApi } from "twitter-api-v2";
import { getTokens, setTokens } from "./store.mjs";

// Run `fn(client)` with the stored OAuth2 access token. On expiry (401), refresh
// via the single-use refresh token, persist the new pair, and retry once.
async function withClient(fn) {
  const { AccessToken } = await getTokens();
  try {
    return await fn(new TwitterApi(AccessToken));
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
    return await fn(new TwitterApi(accessToken));
  }
}

// Post a text tweet. Returns the created tweet data ({ id, text }).
export async function postTweet(text) {
  return withClient(async (c) => (await c.v2.tweet(text)).data);
}

// Post a tweet with an attached video (MP4 bytes). Uploads the media (chunked,
// OAuth2 media.write), then creates the tweet referencing it.
export async function postTweetWithVideo(text, videoBuffer) {
  return withClient(async (c) => {
    const mediaId = await c.v2.uploadMedia(videoBuffer, {
      media_type: "video/mp4",
      media_category: "tweet_video",
    });
    const { data } = await c.v2.tweet(text, { media: { media_ids: [mediaId] } });
    return data;
  });
}
