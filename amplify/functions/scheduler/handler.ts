import { runScheduler } from "../../../lib/tasks.mjs";

export const handler = async () => {
  await runScheduler();
  return { ok: true };
};
