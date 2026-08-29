import { runComments } from "../../../lib/comments.mjs";

export const handler = async () => {
  const r = await runComments();
  return { ok: true, ...r };
};
