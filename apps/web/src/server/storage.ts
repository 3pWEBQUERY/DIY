import "server-only";
import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, features } from "@/server/env";
import { hmac } from "@/server/crypto";

/**
 * Storage-Adapter (§25.3, §25.8): S3-kompatibel (Railway Bucket) in Produktion,
 * lokales Dateisystem als Fallback für Entwicklung. Der Bucket bleibt privat:
 * Öffentliche Medien laufen über den Proxy `/media/…`, private Dateien nur über
 * kurzlebige signierte URLs.
 */
interface Driver {
  presignPut(key: string, mime: string, bytes: number): Promise<string>;
  presignGet(key: string, expiresIn: number, downloadName?: string): Promise<string>;
  put(key: string, body: Buffer, mime: string, cacheControl: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; mime?: string } | null>;
  head(key: string): Promise<{ bytes: number } | null>;
  del(key: string): Promise<void>;
}

let s3client: S3Client | null = null;
function s3() {
  if (!s3client) {
    const e = env();
    s3client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: e.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
    });
  }
  return s3client;
}

const s3Driver: Driver = {
  async presignPut(key, mime, bytes) {
    return getSignedUrl(s3(), new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ContentType: mime, ContentLength: bytes }), { expiresIn: 600 });
  },
  async presignGet(key, expiresIn, downloadName) {
    return getSignedUrl(
      s3(),
      new GetObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName.replace(/[^\w.\- ]/g, "")}"` : undefined,
      }),
      { expiresIn },
    );
  },
  async put(key, body, mime, cacheControl) {
    await s3().send(new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: body, ContentType: mime, CacheControl: cacheControl }));
  },
  async get(key) {
    try {
      const res = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
      return { body: Buffer.from(await res.Body!.transformToByteArray()), mime: res.ContentType };
    } catch {
      return null;
    }
  },
  async head(key) {
    try {
      const r = await s3().send(new HeadObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
      return { bytes: Number(r.ContentLength ?? 0) };
    } catch {
      return null;
    }
  },
  async del(key) {
    await s3().send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  },
};

const ROOT = path.resolve(process.env.LOCAL_STORAGE_DIR ?? ".data/storage");
const safe = (key: string) => {
  const p = path.resolve(ROOT, key);
  if (!p.startsWith(ROOT + path.sep)) throw new Error("Ungültiger Schlüssel");
  return p;
};
export function signLocal(key: string, exp: number, op: "put" | "get") {
  return hmac(env().SESSION_SECRET, `${op}:${key}:${exp}`);
}

const localDriver: Driver = {
  async presignPut(key) {
    const exp = Date.now() + 600_000;
    return `/api/v1/media/local?key=${encodeURIComponent(key)}&exp=${exp}&sig=${signLocal(key, exp, "put")}`;
  },
  async presignGet(key, expiresIn) {
    const exp = Date.now() + expiresIn * 1000;
    return `/api/v1/media/local?key=${encodeURIComponent(key)}&exp=${exp}&sig=${signLocal(key, exp, "get")}`;
  },
  async put(key, body) {
    const p = safe(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
  },
  async get(key) {
    try {
      return { body: await readFile(safe(key)) };
    } catch {
      return null;
    }
  },
  async head(key) {
    try {
      return { bytes: (await stat(safe(key))).size };
    } catch {
      return null;
    }
  },
  async del(key) {
    await unlink(safe(key)).catch(() => {});
  },
};

export const storage = (): Driver => (features.storage() ? s3Driver : localDriver);
export const isLocalStorage = () => !features.storage();

export function publicMediaUrl(key: string) {
  return `/media/${key}`;
}
