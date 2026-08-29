// CLI wrapper for the news reactor. Usage: node --env-file=.env news.mjs
import { runNews } from "./lib/tasks.mjs";
runNews().then(() => console.log("\nApprove at http://localhost:3000/drafts\n"))
  .catch((e) => { console.error(e); process.exit(1); });
