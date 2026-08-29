// Standalone PREVIEW render — proves the BFL FLUX 3 i2v + AI-caption chain on a
// mascot still, with ZERO side effects: it never imports the media store, never
// touches DynamoDB, and never posts to X. Output is a local MP4 for review.
//
// Usage: node --env-file=.env scripts/preview-render.mjs [files] [aspect] ["scene vibe"]
//   single : node --env-file=.env scripts/preview-render.mjs 3.png 1:1
//   scene  : node --env-file=.env scripts/preview-render.mjs 4.png,2.png,3.png 1:1 "turn-to-camera hero reveal"
// Pass 2-3 comma-separated files to animate BETWEEN them as one 5s scene.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderVideoFromImage } from "../lib/bfl.mjs";
import { draftVideoPost } from "../lib/ai.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const files = (process.argv[2] || "3.png").split(",").map((s) => s.trim()).filter(Boolean);
const aspect = process.argv[3] || "1:1"; // square source -> keep 1:1 by default
const sceneVibe = process.argv[4];

const VIBES = {
  "1.png": "bgd0x bull mascot striding forward, pixel-dissolve trailing — entering the arena, bull-run energy",
  "2.png": "bgd0x bull mascot glancing back over its shoulder, calm confident smirk — they doubted, we're still here",
  "3.png": "bgd0x bull mascot arms crossed, unbothered — diamond-hands conviction, not selling",
  "4.png": "bgd0x bull mascot side profile, glowing orange horn-ring — steady long-term believer",
  "5.png": "bgd0x bull mascot hand raised to its chest — hold the line, hodl through the boredom",
};

const keyframes = files.map((f) => readFileSync(join(HERE, "..", "character", f)).toString("base64"));
const vibe = sceneVibe
  || (files.length > 1
    ? `bgd0x bull mascot scene animating through ${files.length} poses (${files.join(" -> ")}): a dynamic turn-to-camera hero reveal, chart pumping`
    : VIBES[files[0]] || `bgd0x mascot (${files[0]})`);

console.log(`Drafting caption + motion for [${files.join(", ")}] …`);
const { caption, motionPrompt } = await draftVideoPost(vibe);
console.log("\n--- CAPTION ---\n" + caption);
console.log("\n--- MOTION PROMPT ---\n" + motionPrompt + "\n");

console.log(`Rendering i2v via BFL (${files.length} keyframe(s), aspect ${aspect}, 5s, hd)… a few minutes.`);
const t0 = Date.now();
const video = await renderVideoFromImage({
  keyframes,
  prompt: motionPrompt,
  duration: 5,
  resolution: "hd",
  aspectRatio: aspect,
  audio: true,
});
const tag = files.map((f) => f.replace(/\.\w+$/, "")).join("-");
const out = join(HERE, "..", "media", `preview-${tag}.mp4`);
writeFileSync(out, video);
console.log(`\n✅ Rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out} (${(video.length / 1e6).toFixed(2)} MB)`);
console.log("CAPTION:: " + caption);
