// CLI wrapper for the video autoposter. Usage: node --env-file=.env video.mjs
import { runVideoPost } from "./lib/tasks.mjs";
runVideoPost()
  .then((r) => console.log("\n" + JSON.stringify(r, null, 2) + "\n"))
  .catch((e) => { console.error(e); process.exit(1); });
