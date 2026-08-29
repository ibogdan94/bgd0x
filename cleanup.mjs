// CLI wrapper for the draft cleanup. Usage: node --env-file=.env cleanup.mjs [days]
import { runCleanup } from "./lib/tasks.mjs";
runCleanup(Number(process.argv[2] || 7))
  .then((r) => console.log(`\nDone. Removed ${r.removed} draft(s) older than ${r.days}d.\n`))
  .catch((e) => { console.error(e); process.exit(1); });
