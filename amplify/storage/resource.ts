import { defineStorage } from "@aws-amplify/backend";
import { video } from "../functions/video/resource";

// S3 bucket holding uploaded source images for the video pipeline. The video
// Lambda reads them; the Next.js hosting compute writes them on upload (granted
// in backend.ts). Bucket name is surfaced to both via MEDIA_BUCKET.
export const storage = defineStorage({
  name: "bgd0xMedia",
  access: (allow) => ({
    "media/*": [allow.resource(video).to(["read", "write", "delete"])],
  }),
});
