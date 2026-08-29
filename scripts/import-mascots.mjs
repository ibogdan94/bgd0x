// One-off: load the bgd0x mascot shots (character/*.png) into the media store
// so the video autoposter can animate them. Idempotent by label — skips a file
// whose label is already present. Writes to S3 when MEDIA_BUCKET is set, else
// the local ./media folder (same code path the Media tab upload uses).
//
// Usage: node --env-file=.env scripts/import-mascots.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { saveImage, listMedia } from "../lib/media.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "character");

// Crypto-flavored vibe per shot — feeds draftVideoPost's caption + motion.
const VIBES = {
  "1.png": "bgd0x bull mascot striding forward, pixel-dissolve trailing — entering the arena, bull-run energy",
  "2.png": "bgd0x bull mascot glancing back over its shoulder, calm confident smirk — they doubted, we're still here",
  "3.png": "bgd0x bull mascot arms crossed, unbothered — diamond-hands conviction, not selling",
  "4.png": "bgd0x bull mascot side profile, glowing orange horn-ring — steady long-term believer",
  "5.png": "bgd0x bull mascot hand raised to its chest — hold the line, hodl through the boredom",
};

const existing = new Set((await listMedia()).map((m) => m.label).filter(Boolean));
const files = readdirSync(DIR).filter((f) => /\.png$/i.test(f)).sort();

let added = 0;
for (const f of files) {
  const label = VIBES[f] || `bgd0x mascot (${f})`;
  if (existing.has(label)) { console.log(`skip  ${f} (already imported)`); continue; }
  const bytes = readFileSync(join(DIR, f));
  const rec = await saveImage(bytes, { contentType: "image/png", label });
  console.log(`added ${f} -> ${rec.id}  key=${rec.key}`);
  added++;
}
console.log(`\nDone. Imported ${added} new mascot image(s). Storage: ${process.env.MEDIA_BUCKET ? "S3 " + process.env.MEDIA_BUCKET : "local ./media"}`);
