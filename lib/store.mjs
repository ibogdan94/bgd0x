// State layer. Uses DynamoDB when STATE_TABLE is set (AWS / Amplify), otherwise
// local JSON/text files (local dev). Same async interface either way, so the
// rest of the app never knows which backend it's on.
import {
  readFileSync, writeFileSync, existsSync, appendFileSync,
} from "node:fs";
import { QUEUE, STATE, DRAFTS, POSTED, NEWS_SEEN, SOURCES, ENV } from "./paths.mjs";

const TABLE = process.env.STATE_TABLE;
const useDynamo = !!TABLE;

// ---------- DynamoDB backend ----------
let _doc;
async function doc() {
  if (!_doc) {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocument } = await import("@aws-sdk/lib-dynamodb");
    _doc = DynamoDBDocument.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _doc;
}
const put = async (item) => (await doc()).put({ TableName: TABLE, Item: item });
const get = async (pk, sk) =>
  (await (await doc()).get({ TableName: TABLE, Key: { pk, sk } })).Item;
const del = async (pk, sk) => (await doc()).delete({ TableName: TABLE, Key: { pk, sk } });
const query = async (pk, extra = {}) =>
  (await (await doc()).query({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": pk },
    ...extra,
  })).Items || [];

// ---------- local file helpers ----------
const readJSON = (p, def) => {
  if (!existsSync(p)) return def;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return def; }
};
const writeJSON = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2));
const isLine = (l) => l.trim() && !l.trim().startsWith("#");

let seq = 0;
const nextSeq = () => `${Date.now()}-${String(seq++).padStart(4, "0")}`;

// ---------- Tokens ----------
export async function getTokens() {
  if (useDynamo) {
    const item = (await get("config", "tokens")) || {};
    return { AccessToken: item.AccessToken, RefreshToken: item.RefreshToken };
  }
  return { AccessToken: process.env.AccessToken, RefreshToken: process.env.RefreshToken };
}
export async function setTokens({ AccessToken, RefreshToken }) {
  if (useDynamo) {
    await put({ pk: "config", sk: "tokens", AccessToken, RefreshToken });
    return;
  }
  // local: persist to .env and process.env
  let text = readFileSync(ENV, "utf8");
  for (const [k, v] of Object.entries({ AccessToken, RefreshToken })) {
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text}\n${k}=${v}`;
    process.env[k] = v;
  }
  writeFileSync(ENV, text);
}

// ---------- Drafts ----------
export async function addDrafts(items) {
  const now = new Date().toISOString();
  const mk = (it, i) => ({
    id: `d_${Date.now()}_${seq++}_${i}`,
    type: it.type || "content",
    text: it.text,
    source: it.source || null,
    mode: it.mode || "queue",
    status: "pending",
    createdAt: now,
  });
  if (useDynamo) {
    for (let i = 0; i < items.length; i++) {
      const it = mk(items[i], i);
      await put({ pk: "draft", sk: it.id, ...it });
    }
    return (await listPending()).length;
  }
  const d = readJSON(DRAFTS, { drafts: [] });
  items.forEach((it, i) => d.drafts.push(mk(it, i)));
  writeJSON(DRAFTS, d);
  return d.drafts.filter((x) => x.status === "pending").length;
}
export async function listPending() {
  if (useDynamo) {
    return query("draft", {
      FilterExpression: "#s = :p",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":pk": "draft", ":p": "pending" },
    });
  }
  return readJSON(DRAFTS, { drafts: [] }).drafts.filter((x) => x.status === "pending");
}
export async function getDraft(id) {
  if (useDynamo) return get("draft", id);
  return readJSON(DRAFTS, { drafts: [] }).drafts.find((x) => x.id === id);
}
export async function updateDraft(id, patch) {
  if (useDynamo) {
    const cur = (await get("draft", id)) || { pk: "draft", sk: id };
    await put({ ...cur, ...patch });
    return;
  }
  const d = readJSON(DRAFTS, { drafts: [] });
  const x = d.drafts.find((x) => x.id === id);
  if (x) Object.assign(x, patch);
  writeJSON(DRAFTS, d);
}

// ---------- Queue ----------
export async function enqueue(text) {
  const clean = text.replace(/\n/g, " ");
  if (useDynamo) { await put({ pk: "queue", sk: nextSeq(), text: clean }); return; }
  const cur = existsSync(QUEUE) ? readFileSync(QUEUE, "utf8") : "";
  const sep = cur === "" || cur.endsWith("\n") ? "" : "\n";
  writeFileSync(QUEUE, cur + sep + clean + "\n");
}
export async function peekQueue() {
  if (useDynamo) {
    const items = await query("queue", { Limit: 1, ScanIndexForward: true });
    return items[0] ? { text: items[0].text, id: items[0].sk } : null;
  }
  if (!existsSync(QUEUE)) return null;
  const lines = readFileSync(QUEUE, "utf8").split("\n");
  const idx = lines.findIndex(isLine);
  return idx === -1 ? null : { text: lines[idx].trim(), id: "__first__" };
}
export async function popQueue(id) {
  if (useDynamo) { await del("queue", id); return; }
  const lines = readFileSync(QUEUE, "utf8").split("\n");
  const idx = lines.findIndex(isLine);
  if (idx !== -1) { lines.splice(idx, 1); writeFileSync(QUEUE, lines.join("\n")); }
}
export async function countQueue() {
  if (useDynamo) {
    // COUNT queries return no Items, so read the Count field directly. Page
    // through in case the queue ever exceeds one 1MB query page.
    let total = 0, ExclusiveStartKey;
    do {
      const res = await (await doc()).query({
        TableName: TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "queue" },
        Select: "COUNT",
        ExclusiveStartKey,
      });
      total += res.Count || 0;
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return total;
  }
  if (!existsSync(QUEUE)) return 0;
  return readFileSync(QUEUE, "utf8").split("\n").filter(isLine).length;
}

// ---------- Schedule state ----------
export async function getState() {
  if (useDynamo) { const i = await get("state", "current"); return i ? i.state : null; }
  return existsSync(STATE) ? readJSON(STATE, null) : null;
}
export async function setState(state) {
  if (useDynamo) { await put({ pk: "state", sk: "current", state }); return; }
  writeJSON(STATE, state);
}

// ---------- News seen (dedupe) ----------
export async function seenHas(key) {
  if (useDynamo) return !!(await get("seen", key));
  return new Set(readJSON(NEWS_SEEN, [])).has(key);
}
export async function seenAdd(keys) {
  if (useDynamo) {
    const ttl = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
    for (const k of keys) await put({ pk: "seen", sk: k, ttl });
    return;
  }
  const set = new Set(readJSON(NEWS_SEEN, []));
  keys.forEach((k) => set.add(k));
  writeJSON(NEWS_SEEN, [...set].slice(-500));
}

// ---------- Sources ----------
export async function listSources() {
  if (useDynamo) return query("source");
  return readJSON(SOURCES, { sources: [] }).sources;
}
export async function getSource(id) {
  if (useDynamo) return get("source", id);
  return readJSON(SOURCES, { sources: [] }).sources.find((s) => s.id === id);
}
export async function addSource({ type, value, label }) {
  const item = {
    id: `s_${Date.now()}_${seq++}`,
    type: type === "rss" ? "rss" : "topic",
    value: value.trim(),
    label: (label || value).trim(),
    createdAt: new Date().toISOString(),
  };
  if (useDynamo) { await put({ pk: "source", sk: item.id, ...item }); return item; }
  const d = readJSON(SOURCES, { sources: [] });
  d.sources.push(item);
  writeJSON(SOURCES, d);
  return item;
}
export async function removeSource(id) {
  if (useDynamo) { await del("source", id); return; }
  const d = readJSON(SOURCES, { sources: [] });
  d.sources = d.sources.filter((s) => s.id !== id);
  writeJSON(SOURCES, d);
}

// ---------- Posted log ----------
export async function logPosted(text, url) {
  const rec = { pk: "posted", sk: new Date().toISOString(), url, text };
  if (useDynamo) { await put(rec); return; }
  appendFileSync(POSTED, `${rec.sk}\t${url}\t${text}\n`);
}

export const backend = useDynamo ? "dynamodb" : "files";
