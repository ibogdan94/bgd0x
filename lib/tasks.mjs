// Core automation tasks, backend-agnostic (store picks files vs DynamoDB).
// Imported by both the CLI wrappers and the Amplify Lambda handlers.
import { postTweet } from "./twitter.mjs";
import { generatePlan, localDateString } from "./schedule.mjs";
import { hasAI, generateTweets, draftNewsReaction } from "./ai.mjs";
import {
  getState, setState, peekQueue, popQueue, countQueue, logPosted,
  addDrafts, seenHas, seenAdd, purgeOldDrafts,
} from "./store.mjs";

const stamp = () => new Date().toISOString();

// ---- Cleanup: drop drafts older than N days so the queue stays fresh ----
export async function runCleanup(days = 7, log = console.log) {
  const removed = await purgeOldDrafts(days);
  log(`[${stamp()}] Cleanup: removed ${removed} draft(s) older than ${days}d.`);
  return { removed, days };
}

// ---- Scheduler: ensure today's plan, post at most one due slot ----
export async function runScheduler(log = console.log) {
  const now = new Date();
  let state = await getState();
  const today = localDateString(now);

  if (!state || state.date !== today) {
    state = generatePlan(now);
    await setState(state);
    log(`[${stamp()}] New plan ${today}: ${state.slots.map((s) => s.label).join(", ") || "(no slots)"}`);
  }

  const due = state.slots
    .filter((s) => !s.posted && new Date(s.atUtc) <= now)
    .sort((a, b) => new Date(a.atUtc) - new Date(b.atUtc));

  if (due.length === 0) {
    const next = state.slots.find((s) => !s.posted);
    log(`[${stamp()}] ${next ? "Nothing due. Next: " + next.label : "All slots done today."}`);
    return { posted: false };
  }

  // Prefer approved queue content; otherwise auto-generate one (no approval needed).
  const item = await peekQueue();
  const text = item ? item.text : await autoTweet(log);

  const data = await postTweet(text);
  const url = `https://x.com/i/status/${data.id}`;
  if (item) await popQueue(item.id);
  due[0].posted = true;
  due[0].url = url;
  await setState(state);
  await logPosted(text, url);
  log(`[${stamp()}] Posted (${due[0].label}, ${item ? "queued" : "auto"}): ${url} | ${await countQueue()} in queue`);
  return { posted: true, url, auto: !item };
}

// Produce one original tweet with no human in the loop (AI, else a template hook).
async function autoTweet(log) {
  if (hasAI()) {
    try {
      const t = await generateTweets(1);
      if (t && t[0]) return t[0];
    } catch (e) { log(`[${stamp()}] auto-gen AI failed, using template: ${e.message}`); }
  }
  return HOOKS[Math.floor(Math.random() * HOOKS.length)];
}

// ---- Content generator (Module C) ----
const HOOKS = [
  "nobody:\nabsolutely nobody:\nme checking the charts at 3am 📈📉",
  "your bags aren't heavy, your conviction is light 🪶",
  "unpopular opinion: 90% of 'alpha' is just patience with extra steps",
  "the market can stay irrational longer than you can stay leveraged 💀",
  "gm to everyone holding through the boredom. that's where the edge is.",
  "you don't have to catch every move. you have to survive every move.",
  "'this is the bottom' — narrator: it was not the bottom",
  "risk management isn't sexy until it's the only reason you're still here",
  "everyone's a long-term investor until their coin is down 20% 🙃",
  "the best trade is often no trade. sit on your hands. touch grass. 🌱",
];

export async function runGenerate(n = 6, log = console.log) {
  let tweets;
  if (hasAI()) {
    try { tweets = await generateTweets(n); }
    catch (e) { log(`AI failed, using templates: ${e.message}`); }
  }
  if (!tweets || !tweets.length) {
    const pool = [...HOOKS];
    tweets = [];
    while (tweets.length < n && pool.length)
      tweets.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  const pending = await addDrafts(tweets.map((text) => ({ type: "content", mode: "queue", text })));
  log(`Generated ${tweets.length} draft(s) ${hasAI() ? "(AI)" : "(templates)"}. ${pending} pending.`);
  return { generated: tweets.length, pending };
}

// ---- News reactor (Module A) ----
const FEEDS = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed",
];
const PER_FEED = 3;

const clean = (s) =>
  (s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();

function parseRss(xml) {
  const items = [];
  for (const block of xml.split(/<item[\s>]/).slice(1)) {
    const title = clean((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const link = clean((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
    if (title) items.push({ title, link });
  }
  return items;
}

export async function runNews(log = console.log) {
  const fresh = [];
  const keys = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed, { headers: { "user-agent": "Mozilla/5.0" } });
      const items = parseRss(await res.text()).slice(0, PER_FEED);
      for (const item of items) {
        const key = item.link || item.title;
        if (!(await seenHas(key))) { fresh.push(item); keys.push(key); }
      }
    } catch (e) { log(`Feed failed (${feed}): ${e.message}`); }
  }

  if (fresh.length === 0) { log("No fresh headlines."); return { drafted: 0 }; }

  const drafts = [];
  for (const item of fresh) {
    let text;
    if (hasAI()) {
      try { text = await draftNewsReaction(item.title); }
      catch (e) { log(`AI draft failed: ${e.message}`); }
    }
    if (!text) text = `👀 ${item.title}`;
    drafts.push({ type: "news", mode: "now", text, source: item.link });
  }
  const pending = await addDrafts(drafts);
  await seenAdd(keys);
  log(`Drafted ${drafts.length} news reaction(s). ${pending} pending.`);
  return { drafted: drafts.length, pending };
}
