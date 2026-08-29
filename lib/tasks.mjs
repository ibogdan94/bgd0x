// Core automation tasks, backend-agnostic (store picks files vs DynamoDB).
// Imported by both the CLI wrappers and the Amplify Lambda handlers.
import { postTweet, postTweetWithVideo } from "./twitter.mjs";
import { generatePlan, localDateString } from "./schedule.mjs";
import { hasAI, generateTweets, draftNewsReaction, draftVideoPost } from "./ai.mjs";
import {
  getState, setState, peekQueue, popQueue, countQueue, logPosted,
  addDrafts, seenHas, seenAdd, purgeOldDrafts, listMedia, updateMedia, addMediaMeta,
} from "./store.mjs";
import { hasBFL, renderVideoFromImage } from "./bfl.mjs";
import {
  getImageBase64, getImageBase64ByKey, markUsed, saveVideoBytes,
  getVideoBytes, pickMascotKeyframes,
} from "./media.mjs";

const stamp = () => new Date().toISOString();

// ---- Video: post one mascot clip to X. Runs weekly (see video/resource.ts). ----
const V_TZ = process.env.POST_TZ || "America/New_York";
const V_START = Number(process.env.WINDOW_START || 8);
const V_END = Number(process.env.WINDOW_END || 22);
// Don't post another weekly video if one already went out in the last N days
// (guards against an EventBridge retry double-posting).
const V_MIN_GAP_DAYS = Number(process.env.VIDEO_MIN_GAP_DAYS || 5);
const localHour = () =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: V_TZ, hour: "2-digit", hour12: false }).format(new Date()));

// The weekly job: post an approved/queued clip if one is waiting (reuses its
// already-rendered video — no extra BFL cost), otherwise auto-generate a fresh
// on-brand mascot clip and post that.
export async function runVideoPost(log = console.log) {
  if (!hasBFL()) return { posted: false, reason: "no BFL key" };

  const hour = localHour();
  if (hour < V_START || hour >= V_END) { log(`[${stamp()}] Video: outside window`); return { posted: false, reason: "outside window" }; }

  const media = await listMedia();
  const gapMs = V_MIN_GAP_DAYS * 24 * 60 * 60 * 1000;
  const postedRecently = media.some(
    (m) => m.status === "used" && m.usedAt && Date.now() - new Date(m.usedAt).getTime() < gapMs
  );
  if (postedRecently) { log(`[${stamp()}] Video: already posted within ${V_MIN_GAP_DAYS}d`); return { posted: false, reason: "posted this week" }; }

  // 1) Prefer a clip that's been queued/approved for posting (stored render).
  const queued = media
    .filter((m) => m.status === "queued" && m.videoKey)
    .sort((a, b) => new Date(a.renderedAt || a.createdAt) - new Date(b.renderedAt || b.createdAt))[0];
  if (queued) return postVideoItem(queued, log);

  // 2) Otherwise generate a fresh mascot clip and post it (hands-free).
  log(`[${stamp()}] Video: no queued clip — auto-generating a mascot scene…`);
  const { video, caption, motionPrompt, keyframes } = await renderMascotVideo({}, log);
  const rec = await addMediaMeta({
    contentType: "image/png", ext: "png", label: "weekly auto mascot",
    status: "preview", caption, motionPrompt, aspect: "1:1", keyframes, key: keyframes[0],
  });
  const videoKey = await saveVideoBytes(rec.id, video);
  await updateMedia(rec.id, { videoKey });
  const data = await postTweetWithVideo(caption, video);
  const url = `https://x.com/i/status/${data.id}`;
  await markUsed(rec.id, { videoUrl: url, videoKey });
  await logPosted(caption, url);
  log(`[${stamp()}] Weekly video posted (auto ${rec.id}): ${url}`);
  return { posted: true, url, from: rec.id, caption, auto: true };
}

// Post an already-rendered clip (its stored MP4 + caption) — no re-render.
async function postVideoItem(item, log = console.log) {
  const bytes = await getVideoBytes(item);
  const data = await postTweetWithVideo(item.caption || "", bytes);
  const url = `https://x.com/i/status/${data.id}`;
  await markUsed(item.id, { videoUrl: url });
  await logPosted(item.caption || "", url);
  log(`[${stamp()}] Weekly video posted (queued ${item.id}): ${url}`);
  return { posted: true, url, from: item.id, caption: item.caption };
}

// Render a mascot clip from a text scene idea. The mascot stills are ALWAYS the
// BFL reference keyframes, so the character is the fixed visual identity.
export async function renderMascotVideo({ text = "", keyframes } = {}, log = console.log) {
  if (!hasBFL()) throw new Error("BFL key not set");
  const keys = keyframes?.length ? keyframes : pickMascotKeyframes();
  log(`[${stamp()}] Video: rendering mascot clip (${keys.length} keyframe(s))${text ? ` — "${text.slice(0, 60)}"` : ""}…`);
  const { caption, motionPrompt } = await draftVideoPost(text);
  const frames = await Promise.all(keys.map((k) => getImageBase64ByKey(k)));
  const video = await renderVideoFromImage({ keyframes: frames, prompt: motionPrompt, duration: 5, resolution: "hd", aspectRatio: "1:1" });
  return { video, caption, motionPrompt, keyframes: keys };
}

// Text-input feature: generate a PREVIEW mascot clip (no post) from typed text,
// saved so it shows in the Media tab. Mascot stills are always the reference.
export async function generateMascotPreview(text = "", log = console.log) {
  const { video, caption, motionPrompt, keyframes } = await renderMascotVideo({ text }, log);
  const rec = await addMediaMeta({
    contentType: "image/png", ext: "png",
    label: text ? `prompt: ${text.slice(0, 80)}` : "mascot scene",
    status: "preview", caption, motionPrompt, aspect: "1:1", keyframes, key: keyframes[0],
  });
  const videoKey = await saveVideoBytes(rec.id, video);
  await updateMedia(rec.id, { videoKey, renderedAt: new Date().toISOString() });
  log(`[${stamp()}] Generated mascot preview ${rec.id}`);
  return { id: rec.id, caption, videoKey };
}

// Resolve the keyframe images (base64) for an item. A "scene" item carries
// `keyframes` (an array of storage keys) so BFL animates through 2-3 poses;
// otherwise it's the item's own single image.
async function resolveKeyframes(item) {
  if (item.keyframes?.length) return Promise.all(item.keyframes.map((k) => getImageBase64ByKey(k)));
  return [await getImageBase64(item)];
}

// Render one image/scene → video and post it. Shared by the scheduler and the
// manual "animate & post" button. Bypasses window/cap (caller decides).
export async function renderAndPost(item, log = console.log) {
  if (!hasBFL()) throw new Error("BFL key not set");
  log(`[${stamp()}] Video: rendering ${item.id}…`);
  const { caption, motionPrompt } = await draftVideoPost(item.label || "");
  const keyframes = await resolveKeyframes(item);
  const video = await renderVideoFromImage({ keyframes, prompt: motionPrompt, duration: 5, resolution: "hd", aspectRatio: item.aspect || "9:16" });

  // Persist the rendered clip so it's viewable in the Media tab even after posting.
  const videoKey = await saveVideoBytes(item.id, video);
  const data = await postTweetWithVideo(caption, video);
  const url = `https://x.com/i/status/${data.id}`;
  await markUsed(item.id, { videoUrl: url, caption, videoKey, motionPrompt });
  await logPosted(caption, url);
  log(`[${stamp()}] Video posted: ${url} (from ${item.id})`);
  return { posted: true, url, from: item.id, caption };
}

// Render a preview clip WITHOUT posting: stores the MP4 + caption on the item so
// it shows in the Media tab. Sets status "preview" so the auto-poster skips it
// (nextUnusedMedia only picks up "pending"). Caller drives posting separately.
export async function renderPreview(item, log = console.log) {
  if (!hasBFL()) throw new Error("BFL key not set");
  log(`[${stamp()}] Video: preview-rendering ${item.id}…`);
  const { caption, motionPrompt } = await draftVideoPost(item.label || "");
  const keyframes = await resolveKeyframes(item);
  const video = await renderVideoFromImage({ keyframes, prompt: motionPrompt, duration: 5, resolution: "hd", aspectRatio: item.aspect || "1:1" });
  const videoKey = await saveVideoBytes(item.id, video);
  await updateMedia(item.id, { status: "preview", caption, motionPrompt, videoKey, renderedAt: new Date().toISOString() });
  log(`[${stamp()}] Preview rendered for ${item.id} (${(video.length / 1e6).toFixed(2)} MB)`);
  return { rendered: true, id: item.id, caption, videoKey };
}

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
