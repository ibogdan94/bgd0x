// CLI wrapper for the scheduler (local dev / launchd). On AWS this logic runs
// as an EventBridge-scheduled Lambda — see amplify/functions/scheduler.
import { runScheduler } from "./lib/tasks.mjs";
runScheduler().catch((e) => { console.error(e); process.exit(1); });
