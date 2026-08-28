// Runs every ~15 min via launchd. Ensures a plan exists for today, then posts
// at most ONE due slot per run (gentle catch-up after sleep, no bursts).
import { postTweet } from "./lib/twitter.mjs";
import {
  generatePlan, loadState, saveState, localDateString,
} from "./lib/schedule.mjs";
import { peekQueue, popQueue, countQueue, logPosted } from "./lib/queue.mjs";

const now = new Date();
const stamp = () => new Date().toISOString();
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

// 1) Ensure today's plan exists.
let state = loadState();
const today = localDateString(now);
if (!state || state.date !== today) {
  state = generatePlan(now);
  saveState(state);
  log(`New plan for ${today} (${state.tz}): ${state.slots.map((s) => s.label).join(", ") || "no slots (late in window)"}`);
}

// 2) Find the earliest due, unposted slot.
const due = state.slots
  .filter((s) => !s.posted && new Date(s.atUtc) <= now)
  .sort((a, b) => new Date(a.atUtc) - new Date(b.atUtc));

if (due.length === 0) {
  const next = state.slots.find((s) => !s.posted);
  log(next ? `Nothing due. Next slot: ${next.label}` : "Nothing due. All slots done for today.");
  process.exit(0);
}

// 3) Post one item.
const text = peekQueue();
if (!text) {
  log(`Slot ${due[0].label} is due but the queue is EMPTY — add tweets to queue.txt.`);
  process.exit(0);
}

try {
  const data = await postTweet(text);
  const url = `https://x.com/i/status/${data.id}`;
  popQueue();
  due[0].posted = true;
  due[0].url = url;
  saveState(state);
  logPosted(text, url);
  log(`Posted (${due[0].label}): ${url}  |  ${countQueue()} left in queue`);
} catch (err) {
  log(`Post FAILED (will retry next run): ${err?.data ? JSON.stringify(err.data) : err.message}`);
  process.exit(1);
}
