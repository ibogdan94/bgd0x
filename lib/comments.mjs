// Reply reactor: reads target profiles' latest tweets, AI-drafts a reply, queues
// it, and auto-posts up to a random 2-5/day cap within the posting window.
// Self-contained (own DynamoDB/file access) to stay conflict-free with store.mjs.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { TwitterApi } from "twitter-api-v2";
import Anthropic from "@anthropic-ai/sdk";
import { getTokens, setTokens } from "./store.mjs";
import { localDateString } from "./schedule.mjs";

const TABLE = process.env.STATE_TABLE;
const useDynamo = !!TABLE;
const FILE = join(process.cwd(), "comments.json");
const TZ = process.env.POST_TZ || "America/New_York";
const WIN_START = Number(process.env.WINDOW_START || 8);
const WIN_END = Number(process.env.WINDOW_END || 22);
const DAILY_MIN = 2;
const DAILY_MAX = 5;

const SEED_TARGETS = [
  { handle: "WatcherGuru", category: "news" },
  { handle: "Cointelegraph", category: "news" },
  { handle: "CoinDesk", category: "news" },
  { handle: "WhiteBit", category: "exchange" },
  { handle: "binance", category: "exchange" },
  { handle: "ethereum", category: "project" },
  { handle: "CryptoCred", category: "influencer" },
  { handle: "Pentosh1", category: "influencer" },
  { handle: "CryptoKaleo", category: "influencer" },
  { handle: "TheCryptoLark", category: "midsize" },
];

// ---------- storage (dynamo | file) ----------
let _doc;
async function doc() {
  if (!_doc) {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocument } = await import("@aws-sdk/lib-dynamodb");
    _doc = DynamoDBDocument.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  }
  return _doc;
}
const dPut = async (item) => (await doc()).put({ TableName: TABLE, Item: item });
const dGet = async (pk, sk) => (await (await doc()).get({ TableName: TABLE, Key: { pk, sk } })).Item;
const dQuery = async (pk) => (await (await doc()).query({
  TableName: TABLE, KeyConditionExpression: "pk = :p", ExpressionAttributeValues: { ":p": pk },
})).Items || [];

const readFile = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { targets: [], comments: [], config: {} });
const writeFile = (d) => writeFileSync(FILE, JSON.stringify(d, null, 2));

let seq = 0;

// ---------- targets (watchlist) ----------
export async function ensureTargets() {
  const cur = await listTargets();
  if (cur.length) return;
  for (const t of SEED_TARGETS) await addTarget(t.handle, t.category);
}
export async function listTargets() {
  if (useDynamo) return (await dQuery("target")).map((t) => ({ id: t.sk, handle: t.handle, category: t.category }));
  return readFile().targets;
}
export async function addTarget(handle, category = "other") {
  const clean = handle.replace(/^@/, "").trim();
  const item = { id: clean.toLowerCase(), handle: clean, category };
  if (useDynamo) { await dPut({ pk: "target", sk: item.id, ...item }); return item; }
  const d = readFile();
  if (!d.targets.find((t) => t.id === item.id)) d.targets.push(item);
  writeFile(d);
  return item;
}
export async function removeTarget(id) {
  if (useDynamo) { await (await doc()).delete({ TableName: TABLE, Key: { pk: "target", sk: id } }); return; }
  const d = readFile();
  d.targets = d.targets.filter((t) => t.id !== id);
  writeFile(d);
}

// ---------- comments queue ----------
export async function listComments(status) {
  let items;
  if (useDynamo) items = (await dQuery("comment")).map((c) => ({ ...c, pk: undefined, sk: undefined }));
  else items = readFile().comments;
  return status ? items.filter((c) => c.status === status) : items;
}
async function addComment({ handle, tweetId, tweetText, reply }) {
  const item = {
    id: `c_${Date.now()}_${seq++}`, handle, tweetId, tweetText, reply,
    status: "planned", url: null, createdAt: new Date().toISOString(), postedAt: null,
  };
  if (useDynamo) { await dPut({ pk: "comment", sk: item.id, ...item }); return item; }
  const d = readFile();
  d.comments.push(item);
  writeFile(d);
  return item;
}
export async function getComment(id) {
  if (useDynamo) return dGet("comment", id);
  return readFile().comments.find((c) => c.id === id);
}
export async function updateComment(id, patch) {
  if (useDynamo) {
    const cur = (await dGet("comment", id)) || { pk: "comment", sk: id };
    await dPut({ ...cur, ...patch });
    return;
  }
  const d = readFile();
  const c = d.comments.find((x) => x.id === id);
  if (c) Object.assign(c, patch);
  writeFile(d);
}

// ---------- daily cap ----------
async function todaysCap() {
  const today = localDateString(new Date());
  if (useDynamo) {
    const cfg = await dGet("commentcfg", "cap");
    if (cfg && cfg.date === today) return cfg.cap;
    const cap = DAILY_MIN + Math.floor(Math.random() * (DAILY_MAX - DAILY_MIN + 1));
    await dPut({ pk: "commentcfg", sk: "cap", date: today, cap });
    return cap;
  }
  const d = readFile();
  if (d.config?.capDate === today) return d.config.cap;
  const cap = DAILY_MIN + Math.floor(Math.random() * (DAILY_MAX - DAILY_MIN + 1));
  d.config = { capDate: today, cap };
  writeFile(d);
  return cap;
}
export async function postedTodayCount() {
  const today = localDateString(new Date());
  return (await listComments("posted")).filter((c) => c.postedAt && localDateString(new Date(c.postedAt)) === today).length;
}
export async function capInfo() {
  return { cap: await todaysCap(), postedToday: await postedTodayCount() };
}

// ---------- X client (with token refresh) ----------
async function withClient(fn) {
  const { AccessToken } = await getTokens();
  try { return await fn(new TwitterApi(AccessToken)); }
  catch (err) {
    if ((err?.code || err?.data?.status) !== 401) throw err;
    const { RefreshToken } = await getTokens();
    const r = new TwitterApi({ clientId: process.env.ClientId, clientSecret: process.env.ClientSecret });
    const { accessToken, refreshToken } = await r.refreshOAuth2Token(RefreshToken);
    await setTokens({ AccessToken: accessToken, RefreshToken: refreshToken });
    return await fn(new TwitterApi(accessToken));
  }
}
async function latestTweet(handle) {
  return withClient(async (c) => {
    const u = await c.v2.userByUsername(handle);
    if (!u?.data?.id) return null;
    const tl = await c.v2.userTimeline(u.data.id, { max_results: 5, exclude: ["retweets", "replies"] });
    const arr = tl?.data?.data || [];
    return arr[0] ? { id: arr[0].id, text: arr[0].text } : null;
  });
}
async function postReply(text, inReplyToId) {
  return withClient(async (c) => (await c.v2.tweet(text, { reply: { in_reply_to_tweet_id: inReplyToId } })).data);
}

// ---------- AI reply drafting ----------
async function draftReply(handle, tweetText) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  const schema = { type: "object", additionalProperties: false, properties: { reply: { type: "string" } }, required: ["reply"] };
  const prompt = `You're a sharp, well-liked crypto Twitter account replying to @${handle}. Write ONE short reply that adds genuine value or wit to the conversation.
Rules: under 240 chars; on-topic to the tweet; no hashtags; no links; no "gm"/"🚀"/emoji-spam filler; no financial advice or price guarantees; not sycophantic ("great post!"); sound like a real person with a take.

Their tweet: "${tweetText}"

Return JSON {reply}.`;
  const res = await client.messages.create({
    model: process.env.AI_MODEL || "claude-opus-4-8",
    max_tokens: 400,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });
  const t = res.content.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(t).reply;
}

// ---------- tasks ----------
// Draft up to `maxNew` fresh planned comments from the watchlist (dedup by tweet).
export async function draftComments(maxNew = 2, log = console.log) {
  await ensureTargets();
  const targets = await listTargets();
  const seen = new Set((await listComments()).map((c) => c.tweetId));
  const shuffled = [...targets].sort(() => Math.random() - 0.5);
  let made = 0;
  for (const t of shuffled) {
    if (made >= maxNew) break;
    let tw;
    try { tw = await latestTweet(t.handle); } catch (e) { log(`read fail @${t.handle}: ${e.message}`); continue; }
    if (!tw || seen.has(tw.id)) continue;
    let reply;
    try { reply = await draftReply(t.handle, tw.text); } catch (e) { log(`draft fail @${t.handle}: ${e.message}`); }
    if (!reply) continue;
    await addComment({ handle: t.handle, tweetId: tw.id, tweetText: tw.text, reply });
    seen.add(tw.id);
    made++;
  }
  return made;
}

// Post the oldest planned comment if under the daily cap and inside the window.
export async function postDueComment(log = console.log) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now));
  if (hour < WIN_START || hour >= WIN_END) return { posted: false, reason: "outside window" };

  const cap = await todaysCap();
  const postedToday = await postedTodayCount();
  if (postedToday >= cap) return { posted: false, reason: `daily cap reached (${cap})` };

  const planned = (await listComments("planned")).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const c = planned[0];
  if (!c) return { posted: false, reason: "no planned comments" };

  const data = await postReply(c.reply, c.tweetId);
  const url = `https://x.com/i/status/${data.id}`;
  await updateComment(c.id, { status: "posted", url, postedAt: new Date().toISOString() });
  return { posted: true, url, handle: c.handle };
}

// Manual controls (dashboard buttons).
export async function postCommentNow(id) {
  const c = await getComment(id);
  if (!c) throw new Error("comment not found");
  const data = await postReply(c.reply, c.tweetId);
  const url = `https://x.com/i/status/${data.id}`;
  await updateComment(id, { status: "posted", url, postedAt: new Date().toISOString() });
  return { posted: true, url };
}
export async function skipComment(id) {
  await updateComment(id, { status: "skipped" });
}

// Lambda entry: top up drafts, then post one if allowed.
export async function runComments(log = console.log) {
  const made = await draftComments(2, log);
  const res = await postDueComment(log);
  log(`comments: drafted ${made}, ${res.posted ? "posted @" + res.handle + " " + res.url : "no post — " + res.reason}`);
  return { made, ...res };
}
