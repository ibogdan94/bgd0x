import { defineStorage } from "@aws-amplify/backend";

// S3 bucket holding uploaded source images for the video pipeline. The video
// Lambda reads/writes them; the Next.js hosting compute writes them on upload.
// Access is granted in backend.ts via CDK (function -> bucket) rather than an
// `allow.resource(video)` rule here — the rule makes the storage stack depend on
// the function stack, which together with the MEDIA_BUCKET env var (function ->
// storage) forms a CloudFormation circular dependency. Granting one-directionally
// from backend.ts avoids it. Bucket name is surfaced via MEDIA_BUCKET.
export const storage = defineStorage({
  name: "bgd0xMedia",
});
