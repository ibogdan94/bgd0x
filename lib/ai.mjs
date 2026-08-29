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
Rules: each tweet under 260 chars. NO hashtags spam (0-1 max). NO financial advice, NO price guarantees,
NO "guaranteed gains" / "100x" promises, NO fake alpha. No referral links (those live in bio). Vary structure.`;

// Generate N original crypto tweets.
export async function generateTweets(n = 5) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { tweets: { type: "array", items: { type: "string" } } },
    required: ["tweets"],
  };
  const prompt = `${VOICE}\n\nWrite ${n} original, distinct crypto tweets. Mix of: relatable degen humor, contrarian market takes, mindset/risk-management one-liners, and meme-y observations. Return JSON.`;
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
  const prompt = `${VOICE}\n\nTOPIC: ${topic}\n\nWrite ${n} original, distinct crypto tweets riffing on this topic. Mix degen humor, contrarian takes, and meme-y observations — each a stop-the-scroll hook, not a summary. Return JSON.`;
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
  const prompt = `${VOICE}\n\nA crypto news headline just dropped:\nHEADLINE: ${headline}\n${summary ? "CONTEXT: " + summary + "\n" : ""}\nWrite ONE sharp, early, opinionated reaction tweet — the kind that gets impressions on Crypto Twitter. Be a take, not a summary. Return JSON.`;
  const out = await callJSON(prompt, schema);
  return out.tweet;
}
