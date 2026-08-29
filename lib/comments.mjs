// Reply reactor (tier-compliant): replies ONLY to tweets that mention @bgd0x or
// are replies in its own threads — the only replies X allows on this API tier.
// Reads mentions → filters spam → AI-drafts a reply (skipping junk) → queues it →
// auto-posts up to a random 2-5/day cap within the posting window.
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

// Obvious junk we never bother the AI (or the account) with.
const SPAM_RE = /casino|bonus|\bfree\s*\$|\$\d{2,}|giveaway|airdrop|claim (your|now)|rewards phase|eligible user|congratulations|you (win|won)|t\.me\/|join now|dm me|pump|1000x|guaranteed|\bnsfw\b/i;

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

const readFile = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { comments: [], config: {} });
const writeFile = (d) => writeFileSync(FILE, JSON.stringify(d, null, 2));

let seq = 0;

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

let _myId;
async function myId(c) {
  if (!_myId) _myId = (await c.v2.me()).data.id;
  return _myId;
}

// Fetch recent mentions of @bgd0x (includes replies to our own tweets, since
// those mention us). Returns [{ id, text, handle }].
async function fetchMentions(limit = 10) {
  return withClient(async (c) => {
    const id = await myId(c);
    const res = await c.v2.userMentionTimeline(id, {
      max_results: Math.min(Math.max(limit, 5), 100),
      "tweet.fields": ["created_at", "author_id", "text"],
      expansions: ["author_id"],
    });
    const tweets = res?.data?.data || res?.tweets || [];
    const users = res?.includes?.users || res?.data?.includes?.users || [];
    return tweets.map((t) => ({
      id: t.id,
      text: t.text,
      handle: users.find((u) => u.id === t.author_id)?.username || t.author_id,
    }));
  });
}

async function postReply(text, inReplyToId) {
  return withClient(async (c) => (await c.v2.tweet(text, { reply: { in_reply_to_tweet_id: inReplyToId } })).data);
}

// ---------- AI reply drafting (with spam gate) ----------
async function draftReply(handle, tweetText) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  const schema = {
    type: "object", additionalProperties: false,
    properties: { worthReplying: { type: "boolean" }, reply: { type: "string" } },
    required: ["worthReplying", "reply"],
  };
  const prompt = `You run @bgd0x, a sharp crypto Twitter account. Someone mentioned you or replied in your thread. Decide whether it deserves a genuine reply.

Set worthReplying=false (reply can be empty) if it is: spam, a scam, a giveaway/casino/airdrop/"you won" bot, engagement farming, a random tag with no substance, or off-topic with nothing to engage.

If it's a real person with a real point, set worthReplying=true and write ONE short reply: under 240 chars, on-topic, no hashtags, no links, not sycophantic ("great post!"), sounds like a real person with a take or a bit of wit.

@${handle} said: "${tweetText}"

Return JSON {worthReplying, reply}.`;
  const res = await client.messages.create({
    model: process.env.AI_MODEL || "claude-opus-4-8",
    max_tokens: 400,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });
  const t = res.content.find((b) => b.type === "text")?.text || "{}";
  const out = JSON.parse(t);
  return out.worthReplying && out.reply ? out.reply : null;
}

// ---------- tasks ----------
// Draft up to `maxNew` fresh replies from recent mentions (dedup + spam filter).
export async function draftComments(maxNew = 2, log = console.log) {
  const seen = new Set((await listComments()).map((c) => c.tweetId));
  let mentions;
  try { mentions = await fetchMentions(15); }
  catch (e) { log(`mentions read failed: ${e.message}`); return 0; }

  let made = 0;
  for (const m of mentions) {
    if (made >= maxNew) break;
    if (seen.has(m.id)) continue;
    if (SPAM_RE.test(m.text)) { seen.add(m.id); continue; } // obvious junk — skip silently
    let reply;
    try { reply = await draftReply(m.handle, m.text); }
    catch (e) { log(`draft fail @${m.handle}: ${e.message}`); }
    seen.add(m.id);
    if (!reply) continue; // AI judged it not worth replying
    await addComment({ handle: m.handle, tweetId: m.id, tweetText: m.text, reply });
    made++;
  }
  return made;
}

// Post the oldest planned reply if under the daily cap and inside the window.
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

// Lambda entry: top up drafts from mentions, then post one if allowed. Posting
// is wrapped so a single failure never aborts the run or blocks future drafts.
export async function runComments(log = console.log) {
  const made = await draftComments(2, log);
  let res = { posted: false, reason: "not attempted" };
  try { res = await postDueComment(log); }
  catch (e) { res = { posted: false, reason: `post error: ${e.message}` }; log(`post failed: ${e.message}`); }
  log(`comments: drafted ${made}, ${res.posted ? "posted @" + res.handle + " " + res.url : "no post — " + res.reason}`);
  return { made, ...res };
}
