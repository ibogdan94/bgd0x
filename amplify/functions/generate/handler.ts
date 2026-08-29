import { runGenerate } from "../../../lib/tasks.mjs";

export const handler = async () => {
  const r = await runGenerate(6);
  return { ok: true, ...r };
};
