import { runVideoPost } from "../../../lib/tasks.mjs";

export const handler = async () => {
  const r = await runVideoPost();
  return { ok: true, ...r };
};
