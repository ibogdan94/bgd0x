import { runNews } from "../../../lib/tasks.mjs";

export const handler = async () => {
  const r = await runNews();
  return { ok: true, ...r };
};
