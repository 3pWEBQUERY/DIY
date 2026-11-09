import "server-only";
import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
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
  /** Streamend schreiben (ohne die ganze Datei im Speicher zu halten); `bytes` = bekannte Länge. */
  putStream(key: string, body: Readable, bytes: number, mime: string, cacheControl: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; mime?: string } | null>;
  /**
   * Streamend lesen, optional nur einen Byte-Bereich (HTTP Range, z. B. für Video in Safari/iOS).
   * `null` = nicht vorhanden, `"unsatisfiable"` = Bereich liegt ausserhalb der Datei.
   */
  getStream(key: string, range?: ByteRange | null): Promise<StreamedObject | null | "unsatisfiable">;
  head(key: string): Promise<{ bytes: number } | null>;
  del(key: string): Promise<void>;
}

/** Ein einzelner Byte-Bereich: start–end (inkl.), offen (`end` fehlt) oder die letzten `suffix` Bytes. */
export type ByteRange = { start: number; end?: number } | { suffix: number };
export type StreamedObject = { body: ReadableStream<Uint8Array>; mime?: string; size: number; length: number; range?: { start: number; end: number } };

/** `Range: bytes=…` parsen – nur ein Bereich; Mehrfachbereiche werden ignoriert (volle Antwort). */
export function parseRange(header: string | null): ByteRange | null {
  const m = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) return { suffix: Number(m[2]) };
  return m[2] ? { start: Number(m[1]), end: Number(m[2]) } : { start: Number(m[1]) };
}

/** Bereich gegen die Dateigrösse auflösen (null = nicht erfüllbar). */
export function resolveRange(r: ByteRange, size: number) {
  if ("suffix" in r) {
    if (r.suffix <= 0 || size === 0) return null;
    return { start: Math.max(0, size - r.suffix), end: size - 1 };
  }
  if (r.start >= size || (r.end !== undefined && r.end < r.start)) return null;
  return { start: r.start, end: Math.min(r.end ?? size - 1, size - 1) };
}

const rangeHeader = (r: ByteRange) => ("suffix" in r ? `bytes=-${r.suffix}` : `bytes=${r.start}-${r.end ?? ""}`);

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
  async putStream(key, body, bytes, mime, cacheControl) {
    await s3().send(new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: body, ContentLength: bytes, ContentType: mime, CacheControl: cacheControl }));
  },
  async get(key) {
    try {
      const res = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
      return { body: Buffer.from(await res.Body!.transformToByteArray()), mime: res.ContentType };
    } catch {
      return null;
    }
  },
  async getStream(key, range) {
    try {
      const res = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ...(range ? { Range: rangeHeader(range) } : {}) }));
      const length = Number(res.ContentLength ?? 0);
      // Content-Range: "bytes 0-1023/52341"
      const cr = res.ContentRange?.match(/bytes (\d+)-(\d+)\/(\d+)/);
      const size = cr ? Number(cr[3]) : length;
      return { body: res.Body!.transformToWebStream() as ReadableStream<Uint8Array>, mime: res.ContentType, size, length, ...(range && cr ? { range: { start: Number(cr[1]), end: Number(cr[2]) } } : {}) };
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === "InvalidRange" || e.$metadata?.httpStatusCode === 416) return "unsatisfiable";
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

const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_STORAGE_DIR ?? ".data/storage");
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
    await mkdir(/*turbopackIgnore: true*/ path.dirname(p), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ p, body);
  },
  async putStream(key, body) {
    const p = safe(key);
    await mkdir(/*turbopackIgnore: true*/ path.dirname(p), { recursive: true });
    await pipeline(body, createWriteStream(/*turbopackIgnore: true*/ p));
  },
  async get(key) {
    try {
      return { body: await readFile(/*turbopackIgnore: true*/ safe(key)) };
    } catch {
      return null;
    }
  },
  async getStream(key, range) {
    let size: number;
    try {
      size = (await stat(/*turbopackIgnore: true*/ safe(key))).size;
    } catch {
      return null;
    }
    const r = range ? resolveRange(range, size) : null;
    if (range && !r) return "unsatisfiable";
    const stream = createReadStream(/*turbopackIgnore: true*/ safe(key), r ? { start: r.start, end: r.end } : {});
    return { body: Readable.toWeb(stream) as ReadableStream<Uint8Array>, size, length: r ? r.end - r.start + 1 : size, ...(r ? { range: r } : {}) };
  },
  async head(key) {
    try {
      return { bytes: (await stat(/*turbopackIgnore: true*/ safe(key))).size };
    } catch {
      return null;
    }
  },
  async del(key) {
    await unlink(/*turbopackIgnore: true*/ safe(key)).catch(() => {});
  },
};

export const storage = (): Driver => (features.storage() ? s3Driver : localDriver);

/**
 * CORS-Regel am Bucket, damit Browser direkt per Presigned URL hochladen dürfen.
 * Nur die eigene App-Domain ist erlaubt. Läuft einmal pro Prozess und ist idempotent.
 */
let corsPromise: Promise<boolean> | null = null;
export function ensureBucketCors() {
  if (!features.storage()) return Promise.resolve(true);
  corsPromise ??= (async () => {
    const e = env();
    const origins = [...new Set([new URL(e.APP_URL).origin, ...(process.env.EXTRA_UPLOAD_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [])])];
    try {
      await s3().send(
        new PutBucketCorsCommand({
          Bucket: e.S3_BUCKET,
          CORSConfiguration: {
            CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }],
          },
        }),
      );
      console.info(JSON.stringify({ level: "info", msg: "bucket_cors_set", origins }));
      return true;
    } catch (err) {
      console.warn(JSON.stringify({ level: "warn", msg: "bucket_cors_failed", err: err instanceof Error ? err.message : String(err) }));
      corsPromise = null; // beim nächsten Upload erneut versuchen
      return false;
    }
  })();
  return corsPromise;
}
export const isLocalStorage = () => !features.storage();

export function publicMediaUrl(key: string) {
  return `/media/${key}`;
}
