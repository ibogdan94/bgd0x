// Quick one-off: post a single tweet from the CLI.
// Usage:  node --env-file=.env tweet.mjs "your text here"
import { TwitterApi } from "twitter-api-v2";

const text = process.argv[2] || "Hello world — my first tweet via the API 🚀";

const { ConsumerKey, SecretKey, AccessToken, AccessTokenSecret } = process.env;

if (!AccessToken || !AccessTokenSecret) {
  console.error(
    "\n❌ Missing AccessToken / AccessTokenSecret in .env.\n" +
      "   Generate them at developer.x.com (app must be Read+Write), then add:\n" +
      "     AccessToken=...\n     AccessTokenSecret=...\n"
  );
  process.exit(1);
}

const client = new TwitterApi({
  appKey: ConsumerKey,
  appSecret: SecretKey,
  accessToken: AccessToken,
  accessSecret: AccessTokenSecret,
});

try {
  const { data } = await client.v2.tweet(text);
  console.log(`\n✅ Posted: https://x.com/i/status/${data.id}\n`);
} catch (err) {
  console.error("\n❌ Failed:", err.message || err, "\n");
  process.exit(1);
}
