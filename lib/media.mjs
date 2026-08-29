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
  if (useS3) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const out = await (await s3()).send(new GetObjectCommand({ Bucket: BUCKET, Key: item.key || `media/${item.id}.${ext}` }));
    return Buffer.from(await out.Body.transformToByteArray());
  }
  return readFileSync(join(MEDIA_DIR, `${item.id}.${ext}`));
}

// Base64 (no data: prefix) — the form BFL keyframes accept.
export async function getImageBase64(item) {
  return (await getImageBytes(item)).toString("base64");
}

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
