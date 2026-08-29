// Source ingestion: pull info from a configured source (RSS feed or topic) and
// turn it into degen tweet drafts that land in the approval queue.
import { addDrafts, seenHas, seenAdd } from "./store.mjs";
import { draftNewsReaction, draftTopicTweets, hasAI } from "./ai.mjs";

export { listSources, getSource, addSource, removeSource } from "./store.mjs";

// --- tiny, dependency-free RSS/Atom parsing ---
const stripCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/<[^>]+>/g, "")
    .trim();

function tagText(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(stripCdata(m[1])) : "";
}

// Parse RSS <item> or Atom <entry> blocks into { title, link }.
export function parseFeed(xml, limit = 12) {
  const blocks = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  const out = [];
  for (const b of blocks) {
    const title = tagText(b, "title");
    if (!title) continue;
    let link = tagText(b, "link");
    if (!link) {
      const m = b.match(/<link[^>]*href=["']([^"']+)["']/i); // Atom
      link = m ? m[1] : "";
    }
    out.push({ title, link });
    if (out.length >= limit) break;
  }
  return out;
}

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
    for (const it of fresh) {
      const text = await draftNewsReaction(it.title);
      if (text) {
        drafts.push({ type: "news", text, source: it.link || source.value, mode: "queue" });
        await seenAdd([it.key]);
      }
    }
    await addDrafts(drafts);
    return drafts.length;
  }

  // topic source
  const tweets = await draftTopicTweets(source.value, n);
  const drafts = tweets.map((text) => ({ type: "content", text, source: null, mode: "queue" }));
  await addDrafts(drafts);
  return drafts.length;
}
