// Post one already-rendered clip to X now, reusing its stored MP4 (no re-render).
// Defaults to the oldest QUEUED clip (what the weekly job would post next).
//   MEDIA_BUCKET=<bucket> node --env-file=.env scripts/post-clip.mjs [mediaId]
import { getMedia, listMedia, updateMedia, logPosted } from "../lib/store.mjs";
import { getVideoBytes } from "../lib/media.mjs";
import { postTweetWithVideo } from "../lib/twitter.mjs";

if (!process.env.STATE_TABLE) throw new Error("STATE_TABLE must be set");
if (!process.env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET must be set");

let id = process.argv[2];
if (!id) {
  const queued = (await listMedia())
    .filter((m) => m.status === "queued" && m.videoKey)
    .sort((a, b) => new Date(a.renderedAt || a.createdAt) - new Date(b.renderedAt || b.createdAt));
  if (!queued.length) throw new Error("no queued clips to post");
  id = queued[0].id;
}

const item = await getMedia(id);
if (!item) throw new Error(`media ${id} not found`);
if (item.status === "used") throw new Error(`media ${id} already posted (${item.videoUrl})`);
if (!item.videoKey) throw new Error(`media ${id} has no rendered video`);

console.log(`Posting ${id}…`);
console.log(`caption: ${item.caption}`);
const bytes = await getVideoBytes(item);
const data = await postTweetWithVideo(item.caption || "", bytes);
const url = `https://x.com/i/status/${data.id}`;
await updateMedia(id, { status: "used", usedAt: new Date().toISOString(), videoUrl: url });
await logPosted(item.caption || "", url);
console.log(`\n✅ Posted: ${url}`);
