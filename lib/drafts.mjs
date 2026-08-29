import { getDraft, updateDraft, enqueue, logPosted } from "./store.mjs";
import { postTweet } from "./twitter.mjs";

export { addDrafts, listPending } from "./store.mjs";

export async function rejectDraft(id) {
  await updateDraft(id, { status: "rejected" });
}

// Approve: post immediately (mode 'now') or add to the scheduled queue (mode 'queue').
export async function approveDraft(id) {
  const x = await getDraft(id);
  if (!x) throw new Error("draft not found");

  if (x.mode === "now") {
    const data = await postTweet(x.text);
    const url = `https://x.com/i/status/${data.id}`;
    await updateDraft(id, { status: "approved", url });
    await logPosted(x.text, url);
    return { posted: true, url };
  }

  await enqueue(x.text);
  await updateDraft(id, { status: "approved" });
  return { queued: true };
}
