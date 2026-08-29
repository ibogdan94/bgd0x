import { join } from "node:path";

// All state files live at the project root. Both the CLI scripts (run from the
// project dir) and the Next.js server (cwd = project dir) resolve to the same files.
const ROOT = process.cwd();

export const ENV = join(ROOT, ".env");
export const QUEUE = join(ROOT, "queue.txt");
export const STATE = join(ROOT, "state.json");
export const DRAFTS = join(ROOT, "drafts.json");
export const POSTED = join(ROOT, "posted.log");
export const NEWS_SEEN = join(ROOT, "news-seen.json");
export const SOURCES = join(ROOT, "sources.json");
export const MEDIA = join(ROOT, "media.json");     // local metadata index
export const MEDIA_DIR = join(ROOT, "media");      // local image bytes
