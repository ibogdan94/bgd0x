// Source ingestion: pull info from a configured source (RSS feed or topic) and
// turn it into degen tweet drafts that land in the approval queue.
import { addDrafts, seenHas, seenAdd, recentPosted } from "./store.mjs";
import { draftNewsReaction, draftTopicTweets, hasAI } from "./ai.mjs";
import { parseFeed } from "./feeds.mjs";

// Re-exported for back-compat: the parser now lives with the feed list.
export { parseFeed, CRYPTO_FEEDS } from "./feeds.mjs";

export { listSources, getSource, addSource, removeSource } from "./store.mjs";

// djb2 hash → stable dedupe key for a headline.
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Generate up to `n` drafts from a source. Returns the number added.
export async function generateFromSource(source, n = 5) {
  if (!hasAI()) throw new Error("ANTHROPIC_API_KEY is not set");

  if (source.type === "rss") {
    const res = await fetch(source.value, {
      headers: { "user-agent": "bgd0x/1.0 (+autoposter)" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`feed fetch failed (${res.status})`);
    const items = parseFeed(await res.text(), 20);
    if (items.length === 0) throw new Error("no items found in feed");

    // Skip headlines we've already reacted to.
    const fresh = [];
    for (const it of items) {
      const key = `src:${hash(it.title)}`;
      if (await seenHas(key)) continue;
      fresh.push({ ...it, key });
      if (fresh.length >= n) break;
    }
    if (fresh.length === 0) return 0;

    const drafts = [];
    const avoid = await recentPosted(20).catch(() => []);
    for (const it of fresh) {
      const text = await draftNewsReaction(it.title, "", {
        avoid: [...avoid, ...drafts.map((d) => d.text)],
      });
      if (text) {
        drafts.push({ type: "news", text, source: it.link || source.value, mode: "queue" });
        await seenAdd([it.key]);
      }
    }
    await addDrafts(drafts);
    return drafts.length;
  }

  // topic source
  const avoid = await recentPosted(20).catch(() => []);
  const tweets = await draftTopicTweets(source.value, n, { avoid });
  const drafts = tweets.map((text) => ({ type: "content", text, source: null, mode: "queue" }));
  await addDrafts(drafts);
  return drafts.length;
}
