import { defineFunction } from "@aws-amplify/backend";

// Housekeeping: deletes drafts older than CLEANUP_DAYS so stale news doesn't
// pile up in the approval queue. Runs once daily at 09:00 UTC. No secrets needed
// (DynamoDB access + STATE_TABLE are granted in backend.ts).
export const cleanup = defineFunction({
  name: "cleanup",
  entry: "./handler.ts",
  schedule: "0 9 * * ? *",
  timeoutSeconds: 120,
  environment: {
    CLEANUP_DAYS: "7",
  },
});
