// Show today's plan + queue. Usage: node --env-file=.env status.mjs
import { localDateString, fmtLocal } from "./lib/schedule.mjs";
import { getState, countQueue, peekQueue, backend } from "./lib/store.mjs";

const now = new Date();
const state = await getState();

console.log(`\nBackend: ${backend}   Now: ${fmtLocal(now)}   (${process.env.POST_TZ || "America/New_York"})`);
console.log(`Queue: ${await countQueue()} pending. Next: "${(await peekQueue())?.text ?? "(empty)"}"\n`);

if (!state || state.date !== localDateString(now)) {
  console.log("No plan for today yet (generated on the scheduler's first run today).\n");
} else {
  console.log(`Today's plan (${state.date}):`);
  for (const s of state.slots) {
    const mark = s.posted ? "✅ posted" : new Date(s.atUtc) <= now ? "⏳ due" : "🕒 upcoming";
    console.log(`  ${s.label.padEnd(22)} ${mark}${s.url ? "  " + s.url : ""}`);
  }
  console.log("");
}
