const TZ = process.env.POST_TZ || "America/New_York";
const WIN_START = Number(process.env.WINDOW_START || 8);
const WIN_END = Number(process.env.WINDOW_END || 22);
const MIN_GAP = 40; // minutes between posts
const MIN_POSTS = 3;
const MAX_POSTS = 5;

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

  const count = MIN_POSTS + Math.floor(Math.random() * (MAX_POSTS - MIN_POSTS + 1));
  const times = [];
  let tries = 0;
  while (times.length < count && tries < 1000 && earliest < latest) {
    tries++;
    const t = earliest + Math.floor(Math.random() * (latest - earliest));
    if (times.every((x) => Math.abs(x - t) >= MIN_GAP)) times.push(t);
  }
  times.sort((a, b) => a - b);

  const slots = times.map((t) => {
    const at = wallToUtc(y, mo, d, Math.floor(t / 60), t % 60);
    return { atUtc: at.toISOString(), label: fmtLocal(at), posted: false, url: null };
  });

  return { date: localDateString(now), tz: TZ, slots };
}
