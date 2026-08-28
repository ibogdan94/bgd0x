// Show today's plan + queue. Usage: node --env-file=.env status.mjs
import { loadState, localDateString, fmtLocal } from "./lib/schedule.mjs";
import { countQueue, peekQueue } from "./lib/queue.mjs";

const now = new Date();
const state = loadState();

console.log(`\nNow: ${fmtLocal(now)}   (${process.env.POST_TZ || "America/New_York"})`);
console.log(`Queue: ${countQueue()} tweet(s) pending. Next up: "${peekQueue() ?? "(empty)"}"\n`);

if (!state || state.date !== localDateString(now)) {
  console.log("No plan for today yet — it's generated on the scheduler's first run today.\n");
} else {
  console.log(`Today's plan (${state.date}):`);
  for (const s of state.slots) {
    const mark = s.posted ? "✅ posted" : new Date(s.atUtc) <= now ? "⏳ due" : "🕒 upcoming";
    console.log(`  ${s.label.padEnd(22)} ${mark}${s.url ? "  " + s.url : ""}`);
  }
  console.log("");
}
