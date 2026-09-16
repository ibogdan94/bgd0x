const TZ = process.env.POST_TZ || "America/New_York";
const WIN_START = Number(process.env.WINDOW_START || 8);
const WIN_END = Number(process.env.WINDOW_END || 22);
// The day's mix: a few reactions to the live news cycle, a few evergreen
// originals. Each count is randomized within its band so the cadence doesn't
// look mechanical; daily volume is the two bands added together (4-6 by
// default). The scheduler posts at most one due slot per run, so the ceilings
// here are what actually governs volume.
const MIN_GAP = Number(process.env.MIN_GAP_MINUTES || 40); // minutes between posts
const NEWS_MIN = Number(process.env.NEWS_PER_DAY_MIN || 2);
const NEWS_MAX = Number(process.env.NEWS_PER_DAY_MAX || 3);
const ORIGINAL_MIN = Number(process.env.ORIGINAL_PER_DAY_MIN || 2);
const ORIGINAL_MAX = Number(process.env.ORIGINAL_PER_DAY_MAX || 3);

const randCount = (min, max) => min + Math.floor(Math.random() * (Math.max(min, max) - min + 1));

// Spread the two kinds through the day instead of posting all the news first.
// Walk the merged slot list and take from whichever kind is proportionally
// furthest behind, so 3 news + 2 originals interleaves rather than clusters.
function mixKinds(news, originals) {
  const out = [];
  let n = 0, o = 0;
  while (n < news || o < originals) {
    if (n >= news) { out.push("original"); o++; continue; }
    if (o >= originals) { out.push("news"); n++; continue; }
    // Compare how far each kind has progressed through its own allowance.
    if ((n + 0.5) / news <= (o + 0.5) / originals) { out.push("news"); n++; }
    else { out.push("original"); o++; }
  }
  return out;
}

const pad = (n) => String(n).padStart(2, "0");

// Offset (ms) between the given zone's wall clock and UTC at `date`.
function tzOffsetMs(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute, m.second);
  return asUTC - date.getTime();
}

// Zone-local Y-M-D H:M -> the exact UTC Date it refers to.
function wallToUtc(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(guess - tzOffsetMs(new Date(guess)));
}

// Zone-local date/time components of `date`.
function localParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    y: +m.year, mo: +m.month, d: +m.day,
    minutesOfDay: +m.hour * 60 + +m.minute,
  };
}

export function localDateString(date) {
  const { y, mo, d } = localParts(date);
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function fmtLocal(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true,
    timeZoneName: "short",
  }).format(date);
}

// Build today's randomized plan. Only schedules slots from `now` onward so a
// mid-day first run doesn't dump a burst of back-dated posts.
export function generatePlan(now) {
  const { y, mo, d, minutesOfDay } = localParts(now);
  const earliest = Math.max(WIN_START * 60, minutesOfDay + 5);
  const latest = WIN_END * 60;

  const newsCount = randCount(NEWS_MIN, NEWS_MAX);
  const originalCount = randCount(ORIGINAL_MIN, ORIGINAL_MAX);
  const count = newsCount + originalCount;
  const times = [];
  let tries = 0;
  while (times.length < count && tries < 2000 && earliest < latest) {
    tries++;
    const t = earliest + Math.floor(Math.random() * (latest - earliest));
    if (times.every((x) => Math.abs(x - t) >= MIN_GAP)) times.push(t);
  }

  // At higher daily counts random placement can fail to fit every slot, which
  // would silently post fewer times than asked. Fill the shortfall by dividing
  // the remaining window evenly and jittering within each band.
  if (times.length < count && earliest < latest) {
    const band = (latest - earliest) / count;
    for (let i = 0; i < count && times.length < count; i++) {
      const lo = earliest + i * band;
      const t = Math.floor(lo + Math.random() * Math.max(1, band - 1));
      if (t < latest && times.every((x) => Math.abs(x - t) >= Math.min(MIN_GAP, band))) times.push(t);
    }
  }
  times.sort((a, b) => a - b);

  // A late first run leaves less room than `count` asked for, so keep the
  // news/original ratio proportional to however many slots actually fit.
  const fit = times.length;
  const news = fit && count
    ? Math.max(0, Math.min(fit, Math.round((newsCount / count) * fit)))
    : 0;
  const kinds = mixKinds(news, fit - news);

  const slots = times.map((t, i) => {
    const at = wallToUtc(y, mo, d, Math.floor(t / 60), t % 60);
    return {
      atUtc: at.toISOString(),
      label: fmtLocal(at),
      kind: kinds[i] || "original",
      posted: false,
      url: null,
    };
  });

  return { date: localDateString(now), tz: TZ, slots };
}
