import { defineFunction, secret } from "@aws-amplify/backend";

// Weekly video autoposter: posts one mascot clip to X. If a clip is queued in
// the Media tab it posts that (reusing its render); otherwise it auto-generates
// a fresh on-brand mascot clip (BFL FLUX 3 i2v) and posts it. Runs weekly on
// Mondays at 15:00 UTC (11am America/New_York). Renders can take minutes.
// Cron day-of-week is numeric per Amplify: Sun=1 … Mon=2 … Sat=7.
export const video = defineFunction({
  name: "video",
  entry: "./handler.ts",
  schedule: "0 15 ? * 2 *",
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
    VIDEO_MIN_GAP_DAYS: "5",
  },
});
