// CLI wrapper for the content generator. Usage: node --env-file=.env generate.mjs [count]
import { runGenerate } from "./lib/tasks.mjs";
runGenerate(Number(process.argv[2] || 6))
  .then(() => console.log("\nReview at http://localhost:3000/drafts\n"))
  .catch((e) => { console.error(e); process.exit(1); });
