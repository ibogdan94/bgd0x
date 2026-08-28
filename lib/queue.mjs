import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";

const QUEUE_PATH = new URL("../queue.txt", import.meta.url);
const LOG_PATH = new URL("../posted.log", import.meta.url);

const isContent = (line) => line.trim() && !line.trim().startsWith("#");

// Return the next tweet text without removing it. null if queue is empty.
export function peekQueue() {
  if (!existsSync(QUEUE_PATH)) return null;
  const lines = readFileSync(QUEUE_PATH, "utf8").split("\n");
  const idx = lines.findIndex(isContent);
  return idx === -1 ? null : lines[idx].trim();
}

// Remove the first content line (call only after a successful post).
export function popQueue() {
  const lines = readFileSync(QUEUE_PATH, "utf8").split("\n");
  const idx = lines.findIndex(isContent);
  if (idx === -1) return;
  lines.splice(idx, 1);
  writeFileSync(QUEUE_PATH, lines.join("\n"));
}

export function countQueue() {
  if (!existsSync(QUEUE_PATH)) return 0;
  return readFileSync(QUEUE_PATH, "utf8").split("\n").filter(isContent).length;
}

export function logPosted(text, url) {
  appendFileSync(LOG_PATH, `${new Date().toISOString()}\t${url}\t${text}\n`);
}
