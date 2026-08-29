// Black Forest Labs (bfl.ai) client — FLUX 3 image-to-video.
// Docs: https://docs.bfl.ai  Auth: `x-key` header. Async create + poll pattern.
const BASE = process.env.BFL_BASE || "https://api.bfl.ai/v1";

export function hasBFL() {
  return !!process.env.BFL;
}

const headers = () => ({
  "x-key": process.env.BFL,
  "Content-Type": "application/json",
  accept: "application/json",
});

// Kick off an image-to-video render. `image` is an http(s) URL or raw base64.
// Returns { id, polling_url }.
export async function createVideoI2V({
  image,
  prompt,
  duration = 5,
  resolution = "hd",       // 'hd' | 'fhd'
  aspectRatio = "9:16",    // vertical, good for X mobile; or 'auto'
  audio = true,
  safetyTolerance = 2,
}) {
  if (!hasBFL()) throw new Error("BFL key not set");
  const body = {
    mode: "i2v",
    prompt,
    keyframes: [image],     // one image → starts the video
    duration,
    resolution,
    aspect_ratio: aspectRatio,
    generate_audio: audio,
    safety_tolerance: safetyTolerance,
  };
  const res = await fetch(`${BASE}/flux-3-video`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.detail || data?.error || res.statusText;
    const err = new Error(`BFL create failed (${res.status}): ${JSON.stringify(msg)}`);
    err.status = res.status;
    throw err;
  }
  if (!data.polling_url) throw new Error("BFL create: no polling_url in response");
  return data; // { id, polling_url }
}

// Poll a polling_url until the task reaches a terminal state. Returns the
// signed result URL (valid ~10 min). Throws on Error/Failed or timeout.
export async function pollResult(pollingUrl, { intervalMs = 4000, timeoutMs = 8 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  // Date.now-based loop is fine here (short-lived task, not resumable state).
  while (Date.now() < deadline) {
    const res = await fetch(pollingUrl, { headers: { "x-key": process.env.BFL, accept: "application/json" } });
    const data = await res.json().catch(() => ({}));
    const status = data?.status;
    if (status === "Ready") {
      const url = data?.result?.sample;
      if (!url) throw new Error("BFL Ready but no result.sample URL");
      return url;
    }
    if (status === "Error" || status === "Failed") {
      throw new Error(`BFL task ${status}: ${JSON.stringify(data?.result || data?.details || data)}`);
    }
    // Pending / Queued / Processing → wait
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("BFL poll timed out");
}

// Full helper: render an image→video and return the downloaded MP4 bytes.
export async function renderVideoFromImage(opts) {
  const { polling_url } = await createVideoI2V(opts);
  const url = await pollResult(polling_url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`video download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
