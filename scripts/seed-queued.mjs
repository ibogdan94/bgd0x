// Pre-seed a few QUEUED mascot clips so the weekly job has a buffer to post.
// Renders each scene via BFL (mascot stills as reference), stores the MP4 in S3,
// and writes a media item with status "queued" to DynamoDB.
//   MEDIA_BUCKET=<bucket> node --env-file=.env scripts/seed-queued.mjs
import { renderMascotVideo } from "../lib/tasks.mjs";
import { saveVideoBytes } from "../lib/media.mjs";
import { addMediaMeta, updateMedia } from "../lib/store.mjs";

if (!process.env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET must be set");
if (!process.env.STATE_TABLE) throw new Error("STATE_TABLE must be set");

const SCENES = [
  {
    text: "shrugs off a big red candle, arms crossed, completely unbothered — not selling, still stacking",
    keyframes: ["media/mascots/5.png", "media/mascots/3.png"],
  },
  {
    text: "chart pumping green in the background, horns glowing brighter, quiet confidence — still early",
    keyframes: ["media/mascots/4.png", "media/mascots/3.png"],
  },
];

for (const [i, scene] of SCENES.entries()) {
  console.log(`\n[${i + 1}/${SCENES.length}] rendering: "${scene.text}"`);
  const { video, caption, motionPrompt, keyframes } = await renderMascotVideo(scene);
  const rec = await addMediaMeta({
    contentType: "image/png", ext: "png",
    label: `queued: ${scene.text.slice(0, 60)}`,
    status: "preview", caption, motionPrompt, aspect: "1:1", keyframes, key: keyframes[0],
  });
  const videoKey = await saveVideoBytes(rec.id, video);
  await updateMedia(rec.id, { videoKey, status: "queued", renderedAt: new Date().toISOString() });
  console.log(`  queued ${rec.id} (${(video.length / 1e6).toFixed(2)} MB)`);
  console.log(`  caption: ${caption}`);
}
console.log("\nDone. Clips are queued for upcoming Mondays.");
