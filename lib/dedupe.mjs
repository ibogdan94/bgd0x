// Near-duplicate detection for generated tweets.
//
// The generator kept collapsing onto one template (five straight posts opening
// "everyone waiting for the perfect entry..."), so every AI-written tweet is now
// checked against recently posted ones — and against the rest of its own batch —
// before it can reach the queue. Cheap string math, no extra model calls.

const STOP = new Set(
  ("a an and are as at be been but by do dont for from had has have i if im in is it its just like me my "
    + "not of on or so than that the their them then there they this to too up us was we were what when "
    + "which while who will with you your yours").split(" ")
);

// Lowercase, drop links/emoji/punctuation, collapse whitespace.
export function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (s) => normalizeText(s).split(" ").filter(Boolean);
const contentWords = (s) => tokens(s).filter((w) => w.length > 2 && !STOP.has(w));

// First `k` meaningful-ish words — catches shared hooks ("everyone waiting for").
export function openingKey(s, k = 3) {
  return tokens(s).slice(0, k).join(" ");
}

function trigrams(s) {
  const t = tokens(s);
  const out = new Set();
  for (let i = 0; i + 2 < t.length; i++) out.add(`${t[i]} ${t[i + 1]} ${t[i + 2]}`);
  return out;
}

const overlap = (a, b) => [...a].filter((x) => b.has(x)).length;

// Jaccard similarity over content words: 0 (nothing shared) .. 1 (identical).
export function similarity(a, b) {
  const A = new Set(contentWords(a));
  const B = new Set(contentWords(b));
  if (!A.size || !B.size) return 0;
  const shared = overlap(A, B);
  return shared / (A.size + B.size - shared);
}

// How much of the SHORTER tweet is contained in the longer one. Jaccard punishes
// length mismatch, so a terse restatement of an old long tweet ("my thesis is btc
// at 500k in three years") scores low there but ~0.8 here.
export function containment(a, b) {
  const A = new Set(contentWords(a));
  const B = new Set(contentWords(b));
  const small = A.size <= B.size ? A : B;
  if (small.size < 4) return 0; // too short to judge
  return overlap(A, B) / small.size;
}

// True when `text` reads like something already in `priors`. Four independent
// signals — any one is enough, because each on its own means "same tweet again":
//   1. word overlap above `threshold`
//   2. the shorter tweet is mostly contained in the longer one
//   3. two or more shared word trigrams (a reused sentence skeleton)
//   4. an identical opening hook
export function isDuplicate(
  text,
  priors = [],
  { threshold = 0.4, contain = 0.65, minShared = 2, openingWords = 3 } = {},
) {
  if (!text || !text.trim()) return true;
  const tri = trigrams(text);
  const open = openingKey(text, openingWords);
  return priors.some((prior) => {
    if (!prior) return false;
    if (similarity(text, prior) >= threshold) return true;
    if (containment(text, prior) >= contain) return true;
    if (overlap(tri, trigrams(prior)) >= minShared) return true;
    return !!open && open === openingKey(prior, openingWords);
  });
}

// Filter a fresh batch against `priors`, also rejecting duplicates *within* the
// batch. Returns { kept, rejected } so callers can log/retry on what was dropped.
export function dedupeBatch(texts = [], priors = [], opts = {}) {
  const kept = [];
  const rejected = [];
  for (const text of texts) {
    if (isDuplicate(text, [...priors, ...kept], opts)) rejected.push(text);
    else kept.push(text);
  }
  return { kept, rejected };
}
