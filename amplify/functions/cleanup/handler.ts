import { runCleanup } from "../../../lib/tasks.mjs";

export const handler = async () => {
  const days = Number(process.env.CLEANUP_DAYS || "7");
  const r = await runCleanup(days);
  return { ok: true, ...r };
};
