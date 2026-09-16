import Anthropic from "@anthropic-ai/sdk";
import { dedupeBatch, isDuplicate, topicSeen } from "./dedupe.mjs";

export function hasAI() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const MODEL = () => process.env.AI_MODEL || "claude-opus-5";

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
/ "guaranteed 100x" promises aimed at followers.

VARIETY IS THE HARD REQUIREMENT — the account's biggest failure mode is posting the same
tweet with new words. So:
- Every tweet must open differently. Never reuse an opening hook, and never open two tweets
  in a batch with the same first three words.
- BANNED openers (worn out, do not use in any form): "everyone waiting", "everyone is",
  "everyone's", "nobody:", "unpopular opinion", "hot take", "pov:", "imagine", "gm to everyone",
  "me checking", "your bags".
- Vary the SHAPE, not just the words: one-liners, two-beat setups, a question, a fake
  screenshot-caption, a numbered list, a short story, a definition, a reply-bait. Not every
  tweet is "observation + moral".
- Vary length. Some should be 6 words. Some can run near the limit.
- Be specific. Name the actual coin, number, protocol, or event you're reacting to. Vague
  "conviction vs the herd" platitudes are the thing that made this account boring.`;

// Distinct angles a tweet can take. A batch draws a DIFFERENT angle per tweet so
// the model can't collapse onto one template.
export const ANGLES = [
  "a contrarian take that argues against the obvious consensus read",
  "self-deprecating degen humor where the author is the punchline",
  "a specific number or stat framed so it actually lands",
  "a short 'what this really means' explainer with zero jargon",
  "a joke built on an absurd but relatable trading scenario",
  "calling out a pattern the timeline keeps falling for",
  "a blunt one-liner with no setup at all",
  "a question that invites replies without being engagement-bait cringe",
  "a fake overheard-quote or group-chat screenshot in text form",
  "comparing crypto behavior to something mundane from normal life",
  "a mindset / risk-management point delivered dry, not preachy",
  "reacting like a sports commentator to a price move",
  "a tiny two-line story with a turn at the end",
  "genuine enthusiasm about something actually built or shipped",
  "deadpan understatement about something objectively chaotic",
  "a prediction stated as a personal bet, with the reasoning compressed",
];

// Fallback subject matter for when no live headlines are available.
export const FALLBACK_TOPICS = [
  "bitcoin price action", "ETF flows", "stablecoin adoption", "L2 fees and rollups",
  "memecoin cycles", "exchange listings", "liquidations and leverage", "self-custody",
  "airdrop farming", "regulation headlines", "miner behavior", "RWA tokenization",
  "onchain data vs narrative", "market structure and liquidity", "altcoin rotation",
];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// n distinct angles (wraps around if n exceeds the pool).
export function pickAngles(n) {
  const out = [];
  while (out.length < n) out.push(...shuffle(ANGLES));
  return out.slice(0, n);
}

// Render live headlines (or fallback subjects) as a topic menu for the prompt.
function topicBlock(topics = []) {
  const titles = topics
    .map((t) => (typeof t === "string" ? t : t?.title))
    .filter(Boolean)
    .slice(0, 12);
  if (!titles.length) {
    return `SUBJECT MATTER — pick different ones per tweet:\n${shuffle(FALLBACK_TOPICS).slice(0, 8).map((t) => `- ${t}`).join("\n")}`;
  }
  return [
    "WHAT'S ACTUALLY HAPPENING RIGHT NOW (live crypto headlines):",
    ...titles.map((t) => `- ${t}`),
    "",
    "Ground the tweets in THIS news cycle. Each tweet must riff on a DIFFERENT item above —",
    "ONE tweet per story, never two angles on the same news. Have a take on it: never summarize",
    "the headline, never quote it verbatim, and don't mention that you read it in the news.",
    "Set each tweet's \"topic\" field to the headline you used, copied exactly; leave it empty",
    "only if the tweet isn't about any listed headline.",
  ].join("\n");
}

// Stories already covered in the last few days — separate from avoidBlock, which
// is about phrasing. A story can be off-limits even when the wording would differ.
function coveredBlock(covered = []) {
  const list = covered.filter(Boolean).slice(0, 20).map((t) => String(t).slice(0, 120));
  if (!list.length) return "";
  return [
    "ALREADY COVERED — the account has tweeted about these stories recently. Do NOT write",
    "about any of them again, from any angle:",
    ...list.map((t) => `- ${t}`),
  ].join("\n");
}

// Tell the model what it has already posted, so it stops rewriting its own tweets.
function avoidBlock(avoid = []) {
  const recent = avoid.filter(Boolean).slice(0, 15).map((t) => String(t).replace(/\s+/g, " ").slice(0, 140));
  if (!recent.length) return "";
  return [
    "ALREADY POSTED — these are the account's most recent tweets. Do NOT repeat their",
    "openings, their sentence structure, their jokes, or their subject matter. Write something",
    "the author has clearly NOT said yet:",
    ...recent.map((t) => `- ${t}`),
  ].join("\n");
}

const sections = (...parts) => parts.filter(Boolean).join("\n\n");

// The author's actual convictions. Weave in NATURALLY and sparingly — first-person
// bets/experiment, never as guaranteed advice for the reader. Reads pull EXCHANGE /
// REF_LINK from env at call time so nothing is hardcoded.
function persona({ conviction = false, allowRef = false } = {}) {
  const exch = process.env.EXCHANGE || "WhiteBIT";
  const ref = process.env.REF_LINK;

  // The thesis is the author's signature line, but repeating it every post is
  // exactly what turned the timeline into one tweet on a loop. It is opt-in per
  // batch, and at most one tweet in that batch may use it.
  if (!conviction) {
    return [
      `Author POV: long-term bitcoin holder, stacks instead of trading, accumulates WBT on ${exch}.`,
      `- For THIS tweet: do NOT state any price target ($500k BTC, $500 WBT), do NOT describe "my thesis"`,
      `  or "my bet", and do NOT include any link. That material is already overused on this account.`,
      `- Write about the subject itself. The author's temperament (patient, unbothered, a bit smug) can show`,
      `  through the writing without being announced.`,
    ].join("\n");
  }

  return [
    `Author POV — ONE tweet in this batch (not more) may lean on this, and only where it genuinely fits:`,
    `- Long-term bitcoin believer. My thesis: BTC ~$500k within ~3 years. I stack, I don't trade it.`,
    `- Bullish on ${exch} and its token WBT. My thesis: WBT ~$500/coin within ~3 years. I'm accumulating WBT as a long-term experiment.`,
    `- Always frame targets as MY bet / conviction / "the experiment" — implicitly not financial advice, never "you will get rich".`,
    `- State it in a NEW way. Do not reuse phrasings like "everyone waiting for the perfect entry", "stack btc,`,
    `  touch grass", "this is my bet, not your homework", "i stack, i don't trade" — those are burned.`,
    allowRef && ref
      ? `- Optional soft CTA to trade on ${exch}: "if you're aping anyway, use my ref 👉 ${ref}". AT MOST ONE tweet per batch, only where it fits. Most tweets have NO link.`
      : `- Do NOT include a referral link in this batch.`,
  ].join("\n");
}

// Roughly one batch in four is allowed to carry the price-target thesis; larger
// batches always get exactly one slot for it.
const convictionAllowed = (n) => (n >= 4 ? true : Math.random() < 0.25);

// Ask the model for `n` tweets, drop near-duplicates of `avoid` (and of each
// other), and retry the shortfall once with the rejects added to the ban list.
async function generateDistinct({ n, avoid, avoidTopics = [], build, log }) {
  const kept = [];          // [{ text, topic }]
  let priors = [...avoid];
  let topics = [...avoidTopics];

  for (let attempt = 0; attempt < 2 && kept.length < n; attempt++) {
    const need = n - kept.length;
    let batch;
    try {
      const out = await callJSON(build(need, priors), TWEETS_SCHEMA);
      batch = (out.tweets || []).filter((t) => t && t.text);
    } catch (e) {
      log?.(`tweet generation failed: ${e.message}`);
      break;
    }

    // Phrasing check first, then story check — a tweet can be worded completely
    // differently and still be the third take on the same news item.
    const { kept: fresh, rejected } = dedupeBatch(batch.map((t) => t.text), priors);
    let sameStory = 0;
    for (const t of batch) {
      if (!fresh.includes(t.text)) continue;
      if (t.topic && topicSeen(t.topic, topics)) { sameStory++; continue; }
      kept.push(t);
      if (t.topic) topics.push(t.topic);
    }

    priors = [...priors, ...batch.map((t) => t.text)];
    if (rejected.length) log?.(`Dropped ${rejected.length} near-duplicate tweet(s).`);
    if (sameStory) log?.(`Dropped ${sameStory} tweet(s) covering an already-covered story.`);
  }
  return kept.slice(0, n);
}

// Each tweet reports the headline it riffed on, so one story can't be covered
// twice under different wording (the tweet-level dedupe compares phrasing and
// happily passes two distinct takes on the same news).
const TWEETS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tweets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          topic: {
            type: "string",
            description: "The exact headline this tweet riffs on, copied verbatim from the list. Empty string if it isn't about any listed headline.",
          },
        },
        required: ["text", "topic"],
      },
    },
  },
  required: ["tweets"],
};

// Generate N original crypto tweets.
export async function generateTweets(n = 5, { avoid = [], topics = [], avoidTopics = [], log } = {}) {
  const conviction = convictionAllowed(n);
  const build = (need, priors) => {
    const angles = pickAngles(need);
    return sections(
      VOICE,
      persona({ conviction, allowRef: conviction && need >= 4 }),
      topicBlock(topics),
      coveredBlock(avoidTopics),
      avoidBlock(priors),
      `Write ${need} original crypto tweets. Assign each tweet a DIFFERENT angle from this list, in order:`
        + `\n${angles.map((a, i) => `${i + 1}. ${a}`).join("\n")}`
        + `\n\nThe ${need} tweets must not resemble each other or anything in ALREADY POSTED. Return JSON.`
    );
  };
  return generateDistinct({ n, avoid, avoidTopics, build, log });
}

// Generate N degen tweets riffing on a specific topic / keyword.
export async function draftTopicTweets(topic, n = 5, { avoid = [], avoidTopics = [], log } = {}) {
  const conviction = convictionAllowed(n);
  const build = (need, priors) => {
    const angles = pickAngles(need);
    return sections(
      VOICE,
      persona({ conviction, allowRef: false }),
      `TOPIC: ${topic}`,
      avoidBlock(priors),
      `Write ${need} original crypto tweets riffing on this topic — each a stop-the-scroll hook, not a summary.`
        + ` Assign each tweet a DIFFERENT angle from this list, in order:`
        + `\n${angles.map((a, i) => `${i + 1}. ${a}`).join("\n")}`
        + `\n\nThe ${need} tweets must not resemble each other or anything in ALREADY POSTED. Return JSON.`
    );
  };
  return generateDistinct({ n, avoid, avoidTopics, build, log });
}

// The recurring brand character the video pipeline animates. Passed to the
// motion prompt so i2v preserves identity and the caption stays in-voice.
const MASCOT = `SUBJECT — the "bgd0x" mascot: a stylized white bison/buffalo in a black "bgd0x" hoodie,
with dark horns wrapped in a glowing orange ring, amber eyes, and an orange-and-white pixel-dissolve
effect trailing off one shoulder. It is the account's brand character — a crypto bull with range:
sometimes calm and contrarian, sometimes hyped, playful, smug, or triumphant depending on the scene.`;

// ---------------------------------------------------------------------------
// Scene composition for the video pipeline.
//
// The mascot reference stills are all tight bust shots on a plain backdrop, so
// asking BFL for "a mascot clip" returned the same centered portrait every time.
// Fixing that needs the SHOT, the BACKGROUND, the ACTION and the FACE BEAT to be
// chosen independently and stated explicitly — a flat list of scene strings just
// reproduces whatever the list's author kept writing. Combining these pools gives
// ~36k distinct scenes instead of 16.
// ---------------------------------------------------------------------------

// Camera position, angle and move. Deliberately biased AWAY from the centered
// chest-up portrait the model falls back to.
export const SHOTS = [
  "EXTREME CLOSE-UP on one amber eye filling the frame, then a fast pull back to reveal the whole scene",
  "LOW HERO ANGLE from floor level looking steeply up, wide lens, the mascot towering over camera",
  "TOP-DOWN overhead shot looking straight down at it, the floor as the backdrop",
  "DUTCH TILT medium shot, the horizon rolled hard, camera slowly righting itself",
  "OVER-THE-SHOULDER from behind, we see past its horns at what it's looking at",
  "WHIP-PAN that snaps across the environment and lands on it mid-action",
  "FULL-BODY WIDE with lots of empty space, the mascot small inside a big environment",
  "HANDHELD TRACKING shot running alongside it, camera bouncing, motion blur",
  "MACRO on its paws doing something in the foreground, face out of frame until it leans down into shot",
  "180° ORBIT arcing around it while it stays still in the center",
  "CRASH ZOOM OUT from a tight close-up to an extreme wide in one move",
  "DRONE RISE climbing vertically from ground level up past its horns and beyond",
  "PROFILE SILHOUETTE rim-lit against a bright backdrop, camera drifting sideways",
  "SNORRICAM-style shot locked to its body so the whole world swings around it",
  "THROUGH-THE-GLASS shot, camera outside a rain-streaked window looking in at it",
  "LOW TRACKING shot skimming along the ground behind its heels as it moves away",
];

// Environment. The single biggest lever — the source stills have no background at
// all, so this is what stops every clip being grey emptiness.
export const SETTINGS = [
  "a neon-soaked Tokyo alley at night, rain on the pavement, kanji signage glowing orange and pink",
  "a wall of trading terminals — dozens of screens, each a different chart, casting colored light",
  "a rooftop at dawn above a city buried in fog, warm sunrise light",
  "inside a vault stacked floor to ceiling with glowing coins",
  "a retro 90s computer lab full of beige CRT monitors all showing green candles",
  "deep space, a planet turning below, stars streaking past",
  "an empty subway car rattling through a tunnel, ad screens flickering overhead",
  "a desert of orange pixel dunes under a huge low sun",
  "a stadium at night, jumbotron blazing behind it, crowd blurred into bokeh",
  "a cozy dark room lit only by one monitor, a mug steaming beside the keyboard",
  "a chrome-and-glass exchange floor with holographic tickers floating in midair",
  "a skate park at dusk where the halfpipe is shaped like a price chart",
  "inside a giant server rack, endless rows of blue LEDs blinking in the dark",
  "a snowy mountain summit above the cloud line, wind whipping",
  "a laundromat at 2am, one dryer spinning, fluorescent light, phone in hand",
  "a rain-lashed harbor at night, container cranes lit by floodlights",
  "an infinite white void with a single floating candlestick chart",
  "a diner booth at 3am, neon sign buzzing through the window",
];

// What actually HAPPENS. The old scene list was mostly standing-and-emoting;
// these are things with motion in them.
export const ACTIONS = [
  "rockets straight up through the frame leaving a trail of orange pixels",
  "flies past camera, banks hard into a turn, and loops back toward us",
  "surfs down the face of a giant green candle like it's a wave",
  "skateboards along a rising trendline and ollies clean over a red dip",
  "slams one fist down and the whole floor cracks apart into pixels",
  "walks away from an explosion behind it without once looking back",
  "casually catches a literal falling knife mid-air and inspects the blade",
  "deadlifts an absurdly oversized glowing coin, horns straining",
  "sprints flat-out on a treadmill going nowhere while the world blurs past",
  "teleports in as a burst of pixels, then calmly brushes off its hoodie",
  "floats weightless, slowly rotating, completely relaxed",
  "punches a red candle so hard it flips green",
  "DJs a set while a crowd of bouncing candlesticks goes off",
  "gets launched out of frame by a slingshot, then strolls back in from the side",
  "sleeps through total chaos, cracks one eye, checks its phone, goes back to sleep",
  "steps off a ledge and free-falls backward with its arms folded",
  "spins a glowing coin on one claw tip like a basketball",
  "kicks open a door and strides through it into the light",
];

// The face beat — the thing that makes a clip feel animated rather than a photo
// with camera move on it.
export const FACE_BEATS = [
  "its pupils spin up into tiny loading rings, then snap back to normal",
  "green candlestick charts scroll across both eyes like a stock ticker",
  "one eye twitches and the horn-ring flares bright in response",
  "its eyes flash into pixel dollar signs for a single frame",
  "pupils blow wide as a number lands, then contract hard",
  "eyes narrow to an unimpressed slit, one brow arching",
  "a tiny rocket streaks across the reflection in its iris",
  "it blinks once, very slowly, while everything behind it detonates",
  "its eyes glow white-hot orange for a beat, then cool back to amber",
  "eyelids droop half-asleep, then snap wide open",
  "a smirk creeps across its muzzle in slow motion",
  "it exhales and the breath fogs into a drifting pixel cloud",
];

export const MOODS = [
  "hyped", "deadpan", "smug", "zen", "triumphant", "menacing but playful",
  "exhausted", "mischievous", "awestruck", "completely unbothered",
];

// Aspect ratio is a real framing lever: the stills are 1:1, so asking for a wider
// or taller frame forces the model to invent the space around the character
// instead of reprinting the same square bust. (Values validated against the BFL
// API — it accepts 21:9, 2:1, 16:9, 4:3, 1:1, 3:4, 9:16, auto.)
export const ASPECTS = ["1:1", "9:16", "9:16", "16:9", "4:3", "3:4"];

const pick = (pool) => pool[Math.floor(Math.random() * pool.length)];

// Pick from `pool`, preferring something not in `used`.
const pickFresh = (pool, used = []) => {
  const fresh = pool.filter((x) => !used.includes(x));
  return pick(fresh.length ? fresh : pool);
};

// Build one scene by drawing each dimension independently. `recent` is a list of
// previous `parts` objects — the last few clips' choices are avoided per
// dimension so consecutive posts can't share a background or an action.
export function composeScene(recent = []) {
  const last = recent.slice(0, 4).filter(Boolean);
  const usedIn = (k) => last.map((p) => p?.[k]).filter(Boolean);

  const parts = {
    shot: pickFresh(SHOTS, usedIn("shot")),
    setting: pickFresh(SETTINGS, usedIn("setting")),
    action: pickFresh(ACTIONS, usedIn("action")),
    face: pickFresh(FACE_BEATS, usedIn("face")),
    mood: pickFresh(MOODS, usedIn("mood")),
    aspect: pickFresh(ASPECTS, usedIn("aspect")),
  };

  const scene = [
    `MOOD: ${parts.mood}`,
    `CAMERA: ${parts.shot}`,
    `SETTING: ${parts.setting}`,
    `ACTION: the mascot ${parts.action}`,
    `FACE BEAT: ${parts.face}`,
  ].join("\n");

  return { scene, parts, key: `${parts.shot}|${parts.setting}|${parts.action}` };
}

// --- back-compat: the old flat scene list, still used for hand-picked scenes ---
export const SCENE_IDEAS = [
  "EUPHORIC: throws both fists up celebrating a green breakout, orange-pixel confetti bursting, camera pulls back fast to reveal a chart screaming upward",
  "DEADPAN: sips from a steaming mug, totally unbothered as tiny red candles rain down around it, slow push-in on the smirk",
  "NIGHT-TRADER: lit only by neon screen-glow, candle charts reflected in the amber eyes, slow lateral dolly, moody and focused",
  "ZEN: sits cross-legged mid-air meditating, candlesticks orbiting its head like a halo, everything calm while chaos blurs behind",
  "UNBOTHERED: shrugs as a blizzard of FUD headlines flies past and disintegrates into pixels, deadpan, static locked-off shot",
  "ATH: fireworks and confetti erupt behind it as a ticker rolls to a new high, arms spread wide, triumphant crane-up shot",
  "STORM: stands still and serene while lightning and red chaos rage outside a window, HODL energy, slow creep-in",
  "GM: faces a pixel sunrise, hopeful and warm, gentle rack-focus from the horns to the glowing horizon",
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

The video is a short brand clip of THIS character, built from a reference still that is a
tight, centered, chest-up portrait on a PLAIN EMPTY BACKDROP.

⚠️ THE FAILURE MODE TO AVOID: past clips all came out as that same centered bust on the same
grey nothing, with a slow push-in and no scene. The source still is the CHARACTER REFERENCE
ONLY — it is not the shot. The shot is the one described in CONTEXT/VIBE above, and it is your
job to write a motion prompt that actually gets there.

- "caption": write it in the mascot's own voice, in the MOOD the scene calls for. Degen crypto
  energy, under 200 chars, 0-1 emoji, no hashtags, no link. Specific to THIS scene — not a
  generic hodl line, and never a narration of the camera move.
- "motionPrompt": one vivid cinematic direction, 2-3 sentences, that hits ALL FOUR beats from
  CONTEXT/VIBE and states each one concretely:
    1. CAMERA — use the exact framing and move given (angle, distance, direction of travel).
       Do NOT substitute "slow push-in" or "slow zoom" for it.
    2. SETTING — the plain backdrop is REPLACED by the described environment. Say what fills
       the frame behind and around the character: surfaces, depth, light sources, weather,
       screens, foreground objects the camera moves past. This is the most important beat.
    3. ACTION — the described action, with real physical motion and follow-through. The
       character should be DOING the thing, not standing near the idea of it.
    4. FACE BEAT — the described eye/face moment, timed to land on a specific frame.
  Keep the bison's face, horns, hoodie, amber eyes and orange horn-ring identity fully intact —
  vary everything around it. Add the signature orange-and-white pixel-dissolve wherever it fits
  the motion. Do NOT restate the caption. Do NOT morph or distort the character.`
    : `You're posting a short hype video made from a still image.
- "caption": the tweet text (degen crypto hype, under 200 chars, 0-1 emoji, no hashtags). No link.
- "motionPrompt": a vivid image-to-video direction describing how the still should come alive — camera move (slow push-in, parallax, orbit), subtle motion, lighting shifts, energy. 1-2 sentences, cinematic, hype. Do NOT restate the caption.`;
  const prompt = `${VOICE}\n\n${persona()}\n\n${hint ? `CONTEXT/VIBE: ${hint}\n\n` : ""}${mascotBlock}\n\nReturn JSON.`;
  return await callJSON(prompt, schema);
}

// Draft one reaction tweet to a news headline.
export async function draftNewsReaction(headline, summary = "", { avoid = [] } = {}) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { tweet: { type: "string" } },
    required: ["tweet"],
  };
  const angle = pickAngles(1)[0];
  const prompt = sections(
    VOICE,
    persona({ conviction: false }),
    `A crypto news headline just dropped:\nHEADLINE: ${headline}${summary ? `\nCONTEXT: ${summary}` : ""}`,
    avoidBlock(avoid),
    `Write ONE sharp, early, opinionated reaction tweet — the kind that gets impressions on Crypto Twitter.`
      + ` Be a take, not a summary. Take this angle: ${angle}. No link. Return JSON.`
  );
  const out = await callJSON(prompt, schema);
  const tweet = out.tweet;
  return isDuplicate(tweet, avoid) ? null : tweet;
}
