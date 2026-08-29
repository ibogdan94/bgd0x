import Anthropic from "@anthropic-ai/sdk";

export function hasAI() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const MODEL = () => process.env.AI_MODEL || "claude-opus-4-8";

// Call Claude with a JSON schema and return the parsed object.
async function callJSON(prompt, schema, maxTokens = 2000) {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL(),
    max_tokens: maxTokens,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(text);
}

const VOICE = `Voice: Crypto Twitter, degen/meme energy mixed with sharp news-reaction takes.
Punchy, funny, contrarian hooks that stop the scroll. Lowercase-friendly, some emojis (sparingly).
Rules: each tweet under 260 chars. NO hashtags spam (0-1 max). NO fake alpha, NO "you'll definitely get rich"
/ "guaranteed 100x" promises aimed at followers. Vary structure.`;

// The author's actual convictions. Weave in NATURALLY and sparingly — first-person
// bets/experiment, never as guaranteed advice for the reader. Reads pull EXCHANGE /
// REF_LINK from env at call time so nothing is hardcoded.
function persona() {
  const exch = process.env.EXCHANGE || "WhiteBIT";
  const ref = process.env.REF_LINK;
  return [
    `Author POV — weave in occasionally as personal conviction, NOT advice for others:`,
    `- Long-term bitcoin believer. My thesis: BTC ~$500k within ~3 years. I stack, I don't trade it.`,
    `- Bullish on ${exch} and its token WBT. My thesis: WBT ~$500/coin within ~3 years. I'm accumulating WBT as a long-term experiment.`,
    `- Always frame targets as MY bet / conviction / "the experiment" — implicitly not financial advice, never "you will get rich".`,
    ref
      ? `- Occasional soft CTA to trade on ${exch}: "if you're aping anyway, use my ref 👉 ${ref}". Include this ref link in AT MOST ONE tweet per batch, only where it fits. Most tweets have NO link.`
      : `- No referral link configured; do not invent one.`,
  ].join("\n");
}

// Generate N original crypto tweets.
export async function generateTweets(n = 5) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { tweets: { type: "array", items: { type: "string" } } },
    required: ["tweets"],
  };
  const prompt = `${VOICE}\n\n${persona()}\n\nWrite ${n} original, distinct crypto tweets. Mix of: relatable degen humor, contrarian market takes, mindset/risk-management one-liners, meme-y observations, and a couple that lean into the author's BTC / ${process.env.EXCHANGE || "WhiteBIT"}+WBT conviction (as personal bets/experiment). Return JSON.`;
  const out = await callJSON(prompt, schema);
  return (out.tweets || []).slice(0, n);
}

// Generate N degen tweets riffing on a specific topic / keyword.
export async function draftTopicTweets(topic, n = 5) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { tweets: { type: "array", items: { type: "string" } } },
    required: ["tweets"],
  };
  const prompt = `${VOICE}\n\n${persona()}\n\nTOPIC: ${topic}\n\nWrite ${n} original, distinct crypto tweets riffing on this topic. Mix degen humor, contrarian takes, and meme-y observations — each a stop-the-scroll hook, not a summary. Where the topic touches BTC or ${process.env.EXCHANGE || "WhiteBIT"}/WBT, let the author's conviction show. Return JSON.`;
  const out = await callJSON(prompt, schema);
  return (out.tweets || []).slice(0, n);
}

// Draft one reaction tweet to a news headline.
export async function draftNewsReaction(headline, summary = "") {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { tweet: { type: "string" } },
    required: ["tweet"],
  };
  const prompt = `${VOICE}\n\n${persona()}\n\nA crypto news headline just dropped:\nHEADLINE: ${headline}\n${summary ? "CONTEXT: " + summary + "\n" : ""}\nWrite ONE sharp, early, opinionated reaction tweet — the kind that gets impressions on Crypto Twitter. Be a take, not a summary. Only let the author's BTC / WBT conviction surface if the headline genuinely relates; don't force it or add a link here. Return JSON.`;
  const out = await callJSON(prompt, schema);
  return out.tweet;
}
