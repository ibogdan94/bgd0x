import { TwitterApi } from "twitter-api-v2";

// OAuth 1.0a user-context client — required to POST tweets.
// Reads credentials from .env (see .env.example for the required keys).
export function getTwitterClient() {
  const {
    ConsumerKey,
    SecretKey,
    AccessToken,
    AccessTokenSecret,
  } = process.env;

  if (!ConsumerKey || !SecretKey || !AccessToken || !AccessTokenSecret) {
    throw new Error(
      "Missing Twitter credentials. Need ConsumerKey, SecretKey, AccessToken, AccessTokenSecret in .env"
    );
  }

  const client = new TwitterApi({
    appKey: ConsumerKey,
    appSecret: SecretKey,
    accessToken: AccessToken,
    accessSecret: AccessTokenSecret,
  });

  // .readWrite gives us posting access
  return client.readWrite;
}
