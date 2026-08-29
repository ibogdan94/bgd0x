import { defineFunction, secret } from "@aws-amplify/backend";

// Pulls crypto RSS, drafts reactions into the approval queue. Hourly.
export const news = defineFunction({
  name: "news",
  entry: "./handler.ts",
  schedule: "0 * * * ? *",
  timeoutSeconds: 120,
  environment: {
    ANTHROPIC_API_KEY: secret("ANTHROPIC_API_KEY"),
    AI_MODEL: "claude-opus-4-8",
  },
});
