// Seed one already-rendered mascot scene into the store so it shows in the Media
// tab: uploads the keyframe stills + the rendered MP4 to S3, and writes a media
// item (status "preview", carrying videoKey + caption) to the state store.
//
// Run against the CLOUD backend (DynamoDB + S3):
//   MEDIA_BUCKET=<bucket> node --env-file=.env scripts/seed-scene.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { addMediaMeta, updateMedia } from "../lib/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUCKET = process.env.MEDIA_BUCKET;
if (!BUCKET) throw new Error("MEDIA_BUCKET must be set (seed to the cloud bucket)");
if (!process.env.STATE_TABLE) throw new Error("STATE_TABLE must be set (seed to DynamoDB)");
const s3 = new S3Client({});

const files = ["4.png", "2.png", "3.png"];
const label = "bgd0x bull — turn-to-camera hero reveal (4→2→3)";
const caption = "turned around cause i heard the doubters getting loud. still stacking. still early. green candles don't scare a bull that's been here since the dip 🟢";
const motionPrompt = "Slow cinematic push-in as the bison turns from side profile to face the camera and crosses its arms, subtle breathing and a slight confident head tilt; the orange horn-ring pulses brighter and pixel-dissolve particles drift off its shoulder while faint green candlesticks tick upward and orange embers rise in the dark background.";

// Create the item first to get its id.
const rec = await addMediaMeta({
  contentType: "image/png", ext: "png", label,
  status: "preview", caption, motionPrompt, aspect: "1:1",
});

// Upload the 3 keyframe stills; the first doubles as the item's poster (key).
const keyframes = [];
for (let i = 0; i < files.length; i++) {
  const key = `media/${rec.id}-${i}.png`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, ContentType: "image/png",
    Body: readFileSync(join(HERE, "..", "character", files[i])),
  }));
  keyframes.push(key);
}

// Upload the rendered MP4.
const videoKey = `renders/${rec.id}.mp4`;
await s3.send(new PutObjectCommand({
  Bucket: BUCKET, Key: videoKey, ContentType: "video/mp4",
  Body: readFileSync(join(HERE, "..", "media", "preview-4-2-3.mp4")),
}));

await updateMedia(rec.id, { key: keyframes[0], keyframes, videoKey });
console.log(`Seeded scene ${rec.id}\n  poster: ${keyframes[0]}\n  keyframes: ${keyframes.length}\n  videoKey: ${videoKey}\n  status: preview (won't auto-post)`);
