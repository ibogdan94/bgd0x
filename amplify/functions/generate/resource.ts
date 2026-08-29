import { defineFunction, secret } from "@aws-amplify/backend";

// Generates fresh degen/news content into the approval queue. Daily at 13:00 UTC (~9am ET).
export const generate = defineFunction({
  name: "generate",
  entry: "./handler.ts",
  schedule: "0 13 * * ? *",
  timeoutSeconds: 120,
  environment: {
    ANTHROPIC_API_KEY: secret("ANTHROPIC_API_KEY"),
    AI_MODEL: "claude-opus-4-8",
  },
});
