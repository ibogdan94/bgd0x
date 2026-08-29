import { defineFunction, secret } from "@aws-amplify/backend";

// Reply reactor: drafts replies from the watchlist + auto-posts up to 2-5/day.
// Runs every 3 hours; posting is gated to the window + daily cap in code.
export const comments = defineFunction({
  name: "comments",
  entry: "./handler.ts",
  schedule: "0 */3 * * ? *",
  timeoutSeconds: 120,
  environment: {
    ClientId: secret("ClientId"),
    ClientSecret: secret("ClientSecret"),
    ANTHROPIC_API_KEY: secret("ANTHROPIC_API_KEY"),
    AI_MODEL: "claude-opus-4-8",
    POST_TZ: "America/New_York",
    WINDOW_START: "8",
    WINDOW_END: "22",
  },
});
