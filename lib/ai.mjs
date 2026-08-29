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
effect trailing off one shoulder. It is the account's brand character — a crypto bull with range:
sometimes calm and contrarian, sometimes hyped, playful, smug, or triumphant depending on the scene.`;

// A pool of DISTINCT scene concepts so auto-generated clips don't all look the
// same. Each mixes a different mood + action + camera move + backdrop. The
// generator picks one (avoiding recent repeats) as the scene for a fresh clip.
export const SCENE_IDEAS = [
  "EUPHORIC: throws both fists up celebrating a green breakout, orange-pixel confetti bursting, camera pulls back fast to reveal a chart screaming upward",
  "DEADPAN: sips from a steaming mug, totally unbothered as tiny red candles rain down around it, slow push-in on the smirk",
  "NIGHT-TRADER: lit only by neon screen-glow, candle charts reflected in the amber eyes, slow lateral dolly, moody and focused",
  "FLEX: slow-mo diamond-hands pose, horns pulsing brighter, gold and orange particles swirling upward, low hero angle",
  "ZEN: sits cross-legged mid-air meditating, candlesticks orbiting its head like a halo, everything calm while chaos blurs behind",
  "COACH: points confidently at a rising trendline like a professor at a chalkboard, quick punch-in on the gesture",
  "UNBOTHERED: shrugs as a blizzard of FUD headlines flies past and disintegrates into pixels, deadpan, static locked-off shot",
  "ENTRANCE: strides in from darkness, dust and orange pixels trailing, dramatic low-angle rising as it approaches",
  "SIDE-EYE: gives a slow unimpressed side-eye at a chart labeled with a rugging shitcoin, one brow raised, tight close-up",
  "ATH: fireworks and confetti erupt behind it as a ticker rolls to a new high, arms spread wide, triumphant crane-up shot",
  "MIC-DROP: calm turn to camera after a call played out, the horn-ring flares once, subtle slow-mo, cocky little nod",
  "STORM: stands still and serene while lightning and red chaos rage outside a window, HODL energy, slow creep-in",
  "GM: faces a pixel sunrise, hopeful and warm, gentle rack-focus from the horns to the glowing horizon",
  "WARM-UP: rolls its shoulders and cracks its neck like a fighter before the bell, chart candles building in the back, hype builds",
  "COUNTING: calmly stacks glowing coins one by one, ignoring the noise, top-down-ish angle, satisfying and steady",
  "SMUG: leans back with arms crossed as a red candle tries to scare it and fails, tiny smirk, the herd panics in the blurred background",
];

// Pick a scene idea, avoiding any in `recent` (list of already-used strings).
export function pickSceneIdea(recent = []) {
  const pool = SCENE_IDEAS.filter((s) => !recent.includes(s));
  const from = pool.length ? pool : SCENE_IDEAS;
  return from[Math.floor(Math.random() * from.length)];
}

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

The video is a short brand clip of THIS character. Match the caption's MOOD and the motion to the specific scene in CONTEXT/VIBE above — make this clip feel different from a generic "calm bull stacking" clip.
- "caption": write it in the mascot's own voice, with the mood the scene calls for (hyped, smug, playful, zen, triumphant, deadpan — not always stoic). Degen crypto energy, under 200 chars, 0-1 emoji, no hashtags, no link. Make it specific to THIS scene, not a generic hodl line.
- "motionPrompt": keep the bison's face, horns, hoodie and identity fully intact, but bring the specific scene to life — use the camera move and action described in the scene (push-in, pull-back, crane, dolly, low angle, etc.), plus believable secondary motion (breathing, head turn, horn-ring pulse, pixel particles). Add crypto ambiance that FITS this scene's mood (green pump / red chaos / neon / fireworks / sunrise / coins — whatever matches), not always green candles. 1-2 vivid sentences, cinematic. Do NOT restate the caption. Do NOT morph or distort the character.`
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
