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

// The recurring brand character the video pipeline animates. Passed to the
// motion prompt so i2v preserves identity and the caption stays in-voice.
const MASCOT = `SUBJECT — the "bgd0x" mascot: a stylized white bison/buffalo in a black "bgd0x" hoodie,
with dark horns wrapped in a glowing orange ring, amber eyes, and an orange-and-white pixel-dissolve
effect trailing off one shoulder. It is the account's brand character — a calm, contrarian crypto bull.`;

// For the video pipeline: given an optional hint (image label or news headline),
// produce a degen tweet caption + a motion/camera prompt to animate the still.
// When `mascot` is true, the still is a bgd0x mascot shot: preserve its identity
// and lean into crypto ambiance.
export async function draftVideoPost(hint = "", { mascot = true } = {}) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      caption: { type: "string" },
      motionPrompt: { type: "string" },
    },
    required: ["caption", "motionPrompt"],
  };
  const mascotBlock = mascot
    ? `${MASCOT}

The video is a short brand clip of THIS character, so:
- "caption": write it in the mascot's own confident, contrarian bull voice (first person is fine). Degen crypto hype, under 200 chars, 0-1 emoji, no hashtags, no link.
- "motionPrompt": keep the bison's face, horns, hoodie and identity fully intact — only SUBTLE, believable motion (slow cinematic push-in or gentle parallax, a slight head turn or breathing, the orange horn-ring pulsing brighter, the pixel-dissolve particles drifting). Add crypto ambiance in the dark background: faint green candlestick charts ticking up, floating orange pixel-embers, soft glow rising as "number goes up." 1-2 sentences, cinematic, hype. Do NOT restate the caption. Do NOT morph or distort the character.`
    : `You're posting a short hype video made from a still image.
- "caption": the tweet text (degen crypto hype, under 200 chars, 0-1 emoji, no hashtags). No link.
- "motionPrompt": a vivid image-to-video direction describing how the still should come alive — camera move (slow push-in, parallax, orbit), subtle motion, lighting shifts, energy. 1-2 sentences, cinematic, hype. Do NOT restate the caption.`;
  const prompt = `${VOICE}\n\n${persona()}\n\n${hint ? `CONTEXT/VIBE: ${hint}\n\n` : ""}${mascotBlock}\n\nReturn JSON.`;
  return await callJSON(prompt, schema);
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
