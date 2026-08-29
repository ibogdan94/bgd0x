import { defineFunction, secret } from "@aws-amplify/backend";

// Video autoposter: animates the oldest unused uploaded image into a short hype
// clip (BFL FLUX 3 i2v) and posts it to X. Gated to the posting window + a daily
// cap in code. Runs every 4 hours; renders can take minutes (long timeout).
export const video = defineFunction({
  name: "video",
  entry: "./handler.ts",
  schedule: "0 */4 * * ? *",
  timeoutSeconds: 600,
  environment: {
    BFL: secret("BFL"),
    ClientId: secret("ClientId"),
    ClientSecret: secret("ClientSecret"),
    ANTHROPIC_API_KEY: secret("ANTHROPIC_API_KEY"),
    AI_MODEL: "claude-opus-4-8",
    POST_TZ: "America/New_York",
    WINDOW_START: "8",
    WINDOW_END: "22",
    VIDEO_DAILY_MAX: "2",
  },
});
