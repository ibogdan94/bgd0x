import { defineFunction, secret } from "@aws-amplify/backend";

// Posts one due slot at random US-Eastern times. Fires every 15 min via EventBridge.
export const scheduler = defineFunction({
  name: "scheduler",
  entry: "./handler.ts",
  schedule: "*/15 * * * ? *",
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
