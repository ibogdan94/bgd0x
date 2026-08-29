// Upload the mascot stills to a STABLE S3 location (media/mascots/<n>.png) so the
// generator (text input + weekly auto-gen) can always attach them as BFL i2v
// reference keyframes. Idempotent. Covered by existing media/* IAM grants.
//   MEDIA_BUCKET=<bucket> node --env-file=.env scripts/import-mascot-refs.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUCKET = process.env.MEDIA_BUCKET;
if (!BUCKET) throw new Error("MEDIA_BUCKET must be set");
const s3 = new S3Client({});

const files = readdirSync(join(HERE, "..", "character")).filter((f) => /\.png$/i.test(f)).sort();
for (const f of files) {
  const key = `media/mascots/${f}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, ContentType: "image/png",
    Body: readFileSync(join(HERE, "..", "character", f)),
  }));
  console.log("uploaded", key);
}
console.log(`Done. ${files.length} mascot reference(s) at media/mascots/ in ${BUCKET}`);
