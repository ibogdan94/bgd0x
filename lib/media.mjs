// Media store for the video pipeline. Metadata lives in the state store
// (see store.mjs); image BYTES live on local disk (dev) or S3 (cloud, when
// MEDIA_BUCKET is set). BFL takes each image as a base64 string (works in both).
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { MEDIA_DIR } from "./paths.mjs";
import { listMedia, getMedia, addMediaMeta, updateMedia, deleteMediaMeta } from "./store.mjs";

export { listMedia, getMedia } from "./store.mjs";

const BUCKET = process.env.MEDIA_BUCKET;
const useS3 = !!BUCKET;

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp" };

let _s3;
async function s3() {
  if (!_s3) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    _s3 = new S3Client({});
  }
  return _s3;
}

// Store bytes, create metadata, return the record.
export async function saveImage(bytes, { contentType = "image/png", label } = {}) {
  const ext = EXT[contentType] || "png";
  const rec = await addMediaMeta({ contentType, ext, label: label || null, key: null });
  const key = `media/${rec.id}.${ext}`;

  if (useS3) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes, ContentType: contentType }));
  } else {
    mkdirSync(MEDIA_DIR, { recursive: true });
    writeFileSync(join(MEDIA_DIR, `${rec.id}.${ext}`), bytes);
  }
  await updateMedia(rec.id, { key });
  return { ...rec, key };
}

export async function getImageBytes(item) {
  const ext = item.ext || "png";
  return getBytesByKey(item.key || `media/${item.id}.${ext}`, `${item.id}.${ext}`);
}

// Read raw bytes for an explicit storage key (S3) or local filename fallback.
// Used for multi-keyframe scenes that reference other images by key.
async function getBytesByKey(key, localName) {
  if (useS3) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const out = await (await s3()).send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return Buffer.from(await out.Body.transformToByteArray());
  }
  // local: key looks like "media/<file>"; strip the prefix to the flat MEDIA_DIR.
  return readFileSync(join(MEDIA_DIR, localName || key.replace(/^media\//, "")));
}

// Base64 (no data: prefix) — the form BFL keyframes accept.
export async function getImageBase64(item) {
  return (await getImageBytes(item)).toString("base64");
}
export async function getImageBase64ByKey(key) {
  return (await getBytesByKey(key)).toString("base64");
}

// ---- Rendered video bytes (the BFL result), stored so the Media tab can play
// it back and the DB keeps a durable pointer (renders/<id>.mp4). ----
export async function saveVideoBytes(id, bytes) {
  const key = `renders/${id}.mp4`;
  if (useS3) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes, ContentType: "video/mp4" }));
  } else {
    const dir = join(MEDIA_DIR, "renders");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.mp4`), bytes);
  }
  return key;
}
export async function getVideoBytes(item) {
  const key = item.videoKey || `renders/${item.id}.mp4`;
  if (useS3) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const out = await (await s3()).send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return Buffer.from(await out.Body.transformToByteArray());
  }
  return readFileSync(join(MEDIA_DIR, "renders", `${item.id}.mp4`));
}

// Presigned S3 URL so the browser fetches bytes DIRECTLY from S3. On Amplify the
// SSR route runs as a Lambda with a ~6MB response cap, so large media (videos,
// big images) must not be streamed through it — redirect to this instead.
// Returns null when not on S3 (local dev streams bytes).
export async function getSignedUrlFor(key, expiresIn = 3600) {
  if (!useS3) return null;
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(await s3(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}
export const usingS3 = () => useS3;

// Oldest image not yet turned into a posted video.
export async function nextUnusedMedia() {
  const all = await listMedia();
  return all
    .filter((m) => m.status === "pending" && m.key)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;
}

export async function markUsed(id, patch = {}) {
  await updateMedia(id, { status: "used", usedAt: new Date().toISOString(), ...patch });
}

export async function removeMedia(id) {
  const item = await getMedia(id);
  if (item) {
    try {
      if (useS3) {
        const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        await (await s3()).send(new DeleteObjectCommand({ Bucket: BUCKET, Key: item.key || `media/${id}.${item.ext}` }));
      } else {
        const f = join(MEDIA_DIR, `${id}.${item.ext || "png"}`);
        if (existsSync(f)) rmSync(f);
      }
    } catch { /* best-effort byte cleanup */ }
  }
  await deleteMediaMeta(id);
}
