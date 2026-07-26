import { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { readFile } from "node:fs/promises";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { readSessionCookie, resolveSession } from "./services/auth.service";

/**
 * HADRAN FABRICS MALL — file uploads.
 * POST /api/upload (multipart, field "file", optional "kind" = chat | product)
 *   → { url, name, mimeType }
 * GET  /uploads/<bucket>/<filename> — serves stored files (session required).
 *
 * Buckets:
 *   chat    — attachments in team chat (needs chat.use)
 *   product — product photos uploaded from the device (needs products.create
 *             or products.edit to upload; any active staff can view)
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const CHAT_MAX_BYTES = MAX_BYTES;

const CHAT_ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  "text/csv": ".csv",
};

const IMAGE_ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

const BUCKETS = ["chat", "product"] as const;
type Bucket = (typeof BUCKETS)[number];

function bucketDir(bucket: Bucket) {
  return path.join(process.cwd(), "uploads", bucket);
}

async function sessionUser(req: Request) {
  const token = readSessionCookie(req);
  if (!token) return null;
  return resolveSession(token);
}

export const uploadApp = new Hono<{ Bindings: HttpBindings }>();

uploadApp.post("/api/upload", async (c) => {
  const session = await sessionUser(c.req.raw);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const form = await c.req.raw.formData().catch(() => null);
  const file = form?.get("file");
  const kindRaw = form?.get("kind");
  const bucket: Bucket = kindRaw === "product" ? "product" : "chat";

  // Permission per bucket.
  if (bucket === "chat" && !session.permissions.includes("chat.use")) {
    return c.json({ error: "You don't have permission to upload chat attachments." }, 403);
  }
  if (
    bucket === "product" &&
    !session.permissions.includes("products.create") &&
    !session.permissions.includes("products.edit")
  ) {
    return c.json({ error: "You don't have permission to upload product photos." }, 403);
  }

  if (!file || !(file instanceof File)) return c.json({ error: "No file provided" }, 400);
  const maxBytes = bucket === "chat" ? CHAT_MAX_BYTES : MAX_BYTES;
  if (file.size > maxBytes) return c.json({ error: "File too large (max 5MB)" }, 413);

  const allowed = bucket === "product" ? IMAGE_ALLOWED : CHAT_ALLOWED;
  const extFromMime = allowed[file.type];
  const extFromName = path.extname(file.name).toLowerCase();
  const ext = extFromMime ?? (extFromName in allowed ? extFromName : null);
  if (!ext) {
    return c.json(
      { error: bucket === "product" ? "Only image files (JPG/PNG/WebP/GIF) are allowed for product photos." : `File type not allowed (${file.type || extFromName})` },
      415,
    );
  }

  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Cloudinary provider: upload to the customer's Cloudinary account instead
  // of local disk (Settings → Storage). Falls back to local on failure.
  const storage = await loadStorageConfig();
  if (storage.provider === "CLOUDINARY" && storage.cloudName && storage.apiKey && storage.apiSecret) {
    try {
      const url = await uploadToCloudinary(buffer, file.type || "application/octet-stream", storage, bucket);
      return c.json({ url, name: file.name, mimeType: file.type || MIME_BY_EXT[ext] || "application/octet-stream" });
    } catch (err) {
      console.error(
        "[upload] Cloudinary failed, falling back to local:",
        err instanceof Error ? err.message : err,
        `\n[upload]   → cloud name: "${storage.cloudName}", api key: "${storage.apiKey.slice(0, 4)}…"` +
          `\n[upload]   → "Invalid Signature" almost always means the API SECRET is wrong or has extra spaces.` +
          ` Re-copy it from Cloudinary dashboard → Settings → API Keys.`,
      );
      // fall through to local storage
    }
  }

  await mkdir(bucketDir(bucket), { recursive: true });
  await writeFile(path.join(bucketDir(bucket), filename), buffer);

  return c.json({
    url: `/uploads/${bucket}/${filename}`,
    name: file.name,
    mimeType: file.type || MIME_BY_EXT[ext] || "application/octet-stream",
  });
});

interface StorageConfig {
  provider: "LOCAL" | "CLOUDINARY";
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

async function loadStorageConfig(): Promise<StorageConfig> {
  const { readSetting } = await import("./services/settings.service");
  const [provider, cloudName, apiKey, apiSecret, folder] = await Promise.all([
    readSetting("storage.provider", "LOCAL"),
    readSetting("storage.cloud_name", ""),
    readSetting("storage.api_key", ""),
    readSetting("storage.api_secret", ""),
    readSetting("storage.folder", "hadran"),
  ]);
  return {
    provider: provider.trim().toUpperCase() === "CLOUDINARY" ? "CLOUDINARY" : "LOCAL",
    // Trim everything — a stray space/newline from copy-paste breaks the signature.
    cloudName: cloudName.trim(),
    apiKey: apiKey.trim(),
    apiSecret: apiSecret.trim(),
    folder: folder.trim().replace(/^\/+|\/+$/g, "") || "hadran",
  };
}

/** Signed server-side upload to Cloudinary (SHA-1 signature, no SDK needed). */
async function uploadToCloudinary(
  buffer: Buffer,
  mimeType: string,
  cfg: StorageConfig,
  bucket: Bucket,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${cfg.folder}/${bucket}`.replace(/\/+/g, "/");
  // Signature: alphabetically sorted params + api_secret.
  const toSign = `folder=${folder}&timestamp=${timestamp}${cfg.apiSecret}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }));
  form.append("api_key", cfg.apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/auto/upload`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message ?? `Cloudinary responded ${res.status}`);
  }
  return data.secure_url;
}

uploadApp.get("/uploads/:bucket/:filename", async (c) => {
  const session = await sessionUser(c.req.raw);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const bucket = c.req.param("bucket") as Bucket;
  const filename = c.req.param("filename");
  if (!BUCKETS.includes(bucket)) return c.json({ error: "Unknown bucket" }, 404);
  // Chat attachments need chat.use; product photos are visible to all staff.
  if (bucket === "chat" && !session.permissions.includes("chat.use")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  // Prevent path traversal.
  if (!/^[\w.-]+$/.test(filename)) return c.json({ error: "Bad filename" }, 400);

  try {
    const data = await readFile(path.join(bucketDir(bucket), filename));
    const ext = path.extname(filename).toLowerCase();
    return fileResponse(data, MIME_BY_EXT[ext] ?? "application/octet-stream");
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});

function fileResponse(data: Buffer, contentType: string) {
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
