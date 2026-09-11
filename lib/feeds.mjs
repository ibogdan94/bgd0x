// Curated crypto news feeds + dependency-free RSS/Atom parsing.
//
// These are the account's default topic supply: instead of writing tweets from a
// static prompt (which made the generator repeat one template forever), the
// generator is handed real headlines from the last news cycle and riffs on those.
// Kept in its own module so it imports nothing from ai/sources — no cycles.

export const CRYPTO_FEEDS = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed",
  "https://www.theblock.co/rss.xml",
  "https://bitcoinmagazine.com/feed",
  "https://cryptoslate.com/feed/",
  "https://blockworks.co/feed",
  "https://beincrypto.com/feed/",
  "https://www.newsbtc.com/feed/",
  "https://protos.com/feed/",
];

const stripCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Numeric entities — feeds are full of curly quotes/dashes (&#8216;, &#x2019;).
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
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

async function fetchFeed(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "bgd0x/1.0 (+autoposter)" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseFeed(await res.text(), 20);
  } finally {
    clearTimeout(timer);
  }
}

// Pull fresh headlines across the feed list (in parallel, failures tolerated).
// Interleaves sources round-robin so one fast/prolific feed can't dominate the
// topic pool, then shuffles so repeat calls don't always surface the same story.
export async function fetchHeadlines({
  feeds = CRYPTO_FEEDS,
  perFeed = 4,
  limit = 20,
  timeoutMs = 8000,
  log,
} = {}) {
  const results = await Promise.allSettled(feeds.map((f) => fetchFeed(f, timeoutMs)));

  const lists = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") lists.push(r.value.slice(0, perFeed));
    else log?.(`Feed failed (${feeds[i]}): ${r.reason?.message || r.reason}`);
  });

  const seen = new Set();
  const merged = [];
  for (let i = 0; i < perFeed; i++) {
    for (const list of lists) {
      const item = list[i];
      if (!item) continue;
      const key = item.title.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  for (let i = merged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [merged[i], merged[j]] = [merged[j], merged[i]];
  }
  return merged.slice(0, limit);
}
