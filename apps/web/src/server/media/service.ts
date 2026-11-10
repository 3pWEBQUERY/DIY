import "server-only";
import { db, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { limit } from "@/server/ratelimit";
import { storage, ensureBucketCors } from "@/server/storage";
import { getSetting } from "@/server/settings";
import { isPro } from "@/server/pro/service";
import type { SessionUser } from "@/server/auth/session";
import { requireFlag } from "@/server/flags";

/** Erlaubte Typen (§25.6 Dateityp-Prüfung). SVG bewusst ausgeschlossen (XSS-Risiko). */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const FILE_TYPES = ["application/pdf", "application/zip"];

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

/** Video-Grenzen: Standard oder – mit Creator Pro – die grosszügigeren Pro-Werte. */
export async function videoLimits(userId: string) {
  const [sec, mb, pro] = await Promise.all([getSetting("media.maxVideoSeconds"), getSetting("media.maxVideoMb"), isPro(userId)]);
  if (!pro) return { maxSeconds: sec, maxMb: mb, pro };
  const [psec, pmb] = await Promise.all([getSetting("pro.maxVideoSeconds"), getSetting("pro.maxVideoMb")]);
  return { maxSeconds: Math.max(sec, psec), maxMb: Math.max(mb, pmb), pro };
}

/** Schritt 1–3 der Media Pipeline: Upload anfordern → Berechtigung & Typ prüfen → signierte Ziel-URL. */
export async function requestUpload(user: SessionUser, input: { mime: string; bytes: number; purpose?: "public" | "private"; durationSec?: number | null }) {
  await limit("upload", user.id);
  const mime = input.mime.toLowerCase();
  const isImage = IMAGE_TYPES.includes(mime);
  const isVideo = VIDEO_TYPES.includes(mime);
  const isFile = FILE_TYPES.includes(mime);
  if (!isImage && !isVideo && !isFile) throw fail.invalid("Dieser Dateityp wird nicht unterstützt.");
  if (isVideo) await requireFlag("uploads.video", user.id);
  if (isFile && input.purpose !== "private") throw fail.invalid("Dateien sind nur für digitale Produkte erlaubt.");
  // Dateien (PDF/ZIP) gibt es nur als digitale Produkte – also nur für Shop-Inhaber:innen
  if (isFile && !(await db.shop.findUnique({ where: { ownerId: user.id }, select: { id: true } }))) throw fail.forbidden("Dateien kannst du hochladen, sobald du einen Shop hast.");
  const limits = isVideo ? await videoLimits(user.id) : null;
  const maxMb = isImage ? await getSetting("media.maxImageMb") : limits ? limits.maxMb : 100;
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > maxMb * 1024 * 1024) {
    throw fail.invalid(`Die Datei ist zu gross (max. ${maxMb} MB).`);
  }
  // Frühe Prüfung mit der vom Browser gelesenen Länge; verbindlich prüft der Worker per ffprobe
  if (isVideo && typeof input.durationSec === "number" && Number.isFinite(input.durationSec)) {
    const maxSec = limits!.maxSeconds;
    if (input.durationSec > maxSec + 1) {
      throw fail.invalid(`Das Video ist zu lang (${Math.round(input.durationSec)} Sek.). Erlaubt sind höchstens ${maxSec >= 60 ? `${Math.round(maxSec / 60)} Min.` : `${maxSec} Sek.`}`);
    }
  }
  const isPrivate = input.purpose === "private";
  const media = await db.media.create({
    data: {
      ownerId: user.id,
      kind: isImage ? "IMAGE" : isVideo ? "VIDEO" : "FILE",
      mime,
      bytes: Math.round(input.bytes),
      isPrivate,
      storageKey: `raw/${user.id}/${crypto.randomUUID()}.${EXT[mime]}`,
    },
  });
  await ensureBucketCors();
  const uploadUrl = await storage().presignPut(media.storageKey, mime, Math.round(input.bytes));
  // Fallback über den eigenen Server, falls der Direkt-Upload (z. B. wegen Netzwerk/CORS) scheitert
  return { mediaId: media.id, uploadUrl, fallbackUrl: `/api/v1/media/${media.id}/upload`, headers: { "Content-Type": mime } };
}

/** Laufende Server-Uploads je Person (im Prozess) – begrenzt parallele grosse Uploads. */
const activeUploads = new Map<string, number>();
const MAX_PARALLEL_SERVER_UPLOADS = 2;

/**
 * Upload über den Server in den Bucket – nur Eigentümer:in, nur angemeldete Grösse, nur einmal.
 * Die Datei wird durchgereicht (Stream), nicht im Arbeitsspeicher gesammelt; eine Datei, die
 * grösser als angemeldet ist, bricht den Upload ab.
 */
export async function uploadViaServer(user: SessionUser, mediaId: string, body: ReadableStream<Uint8Array> | null, contentLength: number) {
  const m = await db.media.findUnique({ where: { id: mediaId } });
  if (!m || m.ownerId !== user.id) throw fail.notFound();
  if (m.state !== "PENDING") throw fail.conflict("Dieses Medium wurde bereits hochgeladen.");
  if (!body) throw fail.invalid("Keine Datei erhalten.");
  if (contentLength && Math.abs(contentLength - m.bytes) > 1024) throw fail.invalid("Die Datei weicht von der Anmeldung ab.");
  const running = activeUploads.get(user.id) ?? 0;
  if (running >= MAX_PARALLEL_SERVER_UPLOADS) throw fail.rate();
  activeUploads.set(user.id, running + 1);
  try {
    const { Readable, Transform } = await import("node:stream");
    let size = 0;
    const guard = new Transform({
      transform(chunk: Buffer, _enc, done) {
        size += chunk.byteLength;
        if (size > m.bytes + 1024) return done(fail.invalid("Die Datei ist grösser als angemeldet."));
        done(null, chunk);
      },
    });
    const stream = Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>).pipe(guard);
    // Gestreamt braucht S3 die Länge vorab: die angemeldete Grösse (Abweichung prüft completeUpload)
    await storage().putStream(m.storageKey, stream, contentLength || m.bytes, m.mime, "private, no-store");
    return { ok: true };
  } finally {
    const n = (activeUploads.get(user.id) ?? 1) - 1;
    if (n <= 0) activeUploads.delete(user.id);
    else activeUploads.set(user.id, n);
  }
}

/** Upload abgeschlossen → Verarbeitung asynchron im Worker (§25.6 Nr. 4). */
export async function completeUpload(user: SessionUser, mediaId: string) {
  const m = await db.media.findUnique({ where: { id: mediaId } });
  if (!m || m.ownerId !== user.id) throw fail.notFound();
  if (m.state !== "PENDING") return { state: m.state, variants: m.variants };
  const head = await storage().head(m.storageKey);
  if (!head) throw fail.invalid("Upload nicht gefunden. Bitte erneut versuchen.");
  if (Math.abs(head.bytes - m.bytes) > 1024) throw fail.invalid("Die hochgeladene Datei weicht von der Anmeldung ab.");
  await db.media.update({ where: { id: m.id }, data: { state: "PROCESSING" } });
  await db.outboxEvent.create({ data: { type: "MediaUploaded", payload: { mediaId: m.id } } });
  // Für sofortiges Feedback: Bilder direkt verarbeiten, falls der Worker (noch) nicht läuft
  if (m.kind === "IMAGE" && process.env.INLINE_MEDIA_PROCESSING !== "false") {
    const { processMedia } = await import("./process");
    await processMedia(m.id).catch((e) => console.error(JSON.stringify({ level: "warn", msg: "inline_media_failed", err: String(e) })));
  }
  const fresh = await db.media.findUniqueOrThrow({ where: { id: m.id }, select: { state: true, variants: true, width: true, height: true } });
  return fresh;
}

/** Medien einer Inhaltsentität zuordnen – nur eigene, verarbeitete Medien (§25.6 Nr. 7). */
export async function attachMedia(tx: Tx, ownerId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await tx.media.findMany({ where: { id: { in: ids } }, select: { id: true, ownerId: true, state: true, processingError: true } });
  if (rows.length !== new Set(ids).size || rows.some((r) => r.ownerId !== ownerId)) throw fail.forbidden("Ungültige Medien.");
  const failed = rows.find((r) => r.state === "FAILED");
  if (failed) throw fail.invalid(failed.processingError ? `${failed.processingError} Entferne die Datei, um fortzufahren.` : "Eine Datei konnte nicht verarbeitet werden. Entferne sie, um fortzufahren.");
  if (rows.some((r) => r.state === "PENDING")) throw fail.invalid("Mindestens ein Medium ist noch nicht hochgeladen.");
  await tx.media.updateMany({ where: { id: { in: ids } }, data: { attachedAt: new Date() } });
}

export async function mediaCoverUrl(mediaId: string | undefined | null) {
  if (!mediaId) return null;
  const m = await db.media.findUnique({ where: { id: mediaId }, select: { variants: true } });
  const v = (m?.variants ?? {}) as Record<string, string>;
  return v.lg ?? v.md ?? null;
}

/**
 * Eingefrorene Verweise nachtragen: Anleitungsschritte (TutorialStep.media), Journal-Einträge
 * (ProjectUpdate.media) und Cover (Project/Tutorial.coverUrl) speichern beim Speichern die URL des
 * Mediums. War es da noch in Verarbeitung (PROCESSING), steht dort `null` – das Bild fehlte in der
 * veröffentlichten Version für immer. Sobald das Medium READY ist, werden diese Stellen ergänzt.
 *
 * Aufgerufen vom Worker nach `processMedia` und nach dem Speichern, falls eine URL fehlte (Wettlauf:
 * Medium wird fertig, bevor die Speicher-Transaktion committet). Idempotent; ändert nur leere URLs.
 * Gefiltert über die Eigentümerin (nur eigene Medien lassen sich anhängen) → indexgestützt, kein Tabellenscan.
 */
export async function patchFrozenMediaRefs(mediaId: string) {
  const m = await db.media.findUnique({ where: { id: mediaId }, select: { ownerId: true, state: true, variants: true } });
  if (!m || m.state !== "READY") return { patched: 0 };
  const v = (m.variants ?? {}) as Record<string, string>;
  const url = v.lg ?? v.md ?? v.sm ?? null; // wie mediaUrls() in Anleitungen/Projekten
  const cover = v.lg ?? v.md ?? null; // wie mediaCoverUrl()
  let patched = 0;
  if (url) {
    const ref = JSON.stringify([{ mediaId }]);
    patched += await db.$executeRaw`
      UPDATE "TutorialStep" s SET media = (
        SELECT jsonb_agg(CASE WHEN e->>'mediaId' = ${mediaId} AND COALESCE(e->>'url', '') = '' THEN jsonb_set(e, '{url}', to_jsonb(${url}::text)) ELSE e END ORDER BY i)
        FROM jsonb_array_elements(s.media) WITH ORDINALITY AS t(e, i))
      FROM "TutorialVersion" tv JOIN "Tutorial" tu ON tu.id = tv."tutorialId"
      WHERE s."versionId" = tv.id AND tu."authorId" = ${m.ownerId}
        AND jsonb_typeof(s.media) = 'array' AND s.media @> ${ref}::jsonb
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.media) x WHERE x->>'mediaId' = ${mediaId} AND COALESCE(x->>'url', '') = '')`;
    patched += await db.$executeRaw`
      UPDATE "ProjectUpdate" u SET media = (
        SELECT jsonb_agg(CASE WHEN e->>'mediaId' = ${mediaId} AND COALESCE(e->>'url', '') = '' THEN jsonb_set(e, '{url}', to_jsonb(${url}::text)) ELSE e END ORDER BY i)
        FROM jsonb_array_elements(u.media) WITH ORDINALITY AS t(e, i))
      WHERE u."authorId" = ${m.ownerId}
        AND jsonb_typeof(u.media) = 'array' AND u.media @> ${ref}::jsonb
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(u.media) x WHERE x->>'mediaId' = ${mediaId} AND COALESCE(x->>'url', '') = '')`;
  }
  if (cover) {
    patched += (await db.project.updateMany({ where: { ownerId: m.ownerId, coverMediaId: mediaId, coverUrl: null }, data: { coverUrl: cover } })).count;
    patched += (await db.tutorial.updateMany({ where: { authorId: m.ownerId, coverUrl: null, media: { some: { mediaId, position: 0 } } }, data: { coverUrl: cover } })).count;
  }
  return { patched };
}

/** Nach dem Speichern: Medien, deren URL beim Einfrieren noch fehlte, nachtragen, falls sie inzwischen fertig sind. */
export async function patchFrozenMediaRefsLater(mediaIds: (string | null | undefined)[]) {
  for (const id of new Set(mediaIds.filter((x): x is string => !!x))) {
    await patchFrozenMediaRefs(id).catch((e) => console.warn(JSON.stringify({ level: "warn", msg: "media_ref_patch_failed", err: e instanceof Error ? e.message : String(e) })));
  }
}

/**
 * Tatsächliche Verwendung von Medien – auf Abfrage berechnet statt aus dem „klebrigen“ `attachedAt`
 * (wird beim Anhängen gesetzt, aber nie zurückgesetzt, wenn der Inhalt gelöscht wird).
 *
 * Erfasst: Verknüpfungstabellen (Beitrag, Projekt, Produkt, Anleitung), Projekt-Cover (coverMediaId),
 * digitale Produktdateien, Verweise per URL (Profil, Cover von Projekt/Anleitung/Artikel/Community/Produkt)
 * und JSON-Felder mit Medien-ID (Anleitungsschritte, Journal, Nachrichten, Artikelblöcke inkl. Revisionen).
 * JSON-Abfragen sind auf die Eigentümer:innen eingeschränkt (nur eigene Medien lassen sich anhängen).
 */
export async function mediaInUse(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Set();
  const rows = await db.media.findMany({ where: { id: { in: unique } }, select: { id: true, ownerId: true, variants: true } });
  if (!rows.length) return new Set();
  const mediaIds = rows.map((r) => r.id);
  const owners = [...new Set(rows.map((r) => r.ownerId))];
  const byUrl = new Map<string, string>();
  for (const r of rows) for (const u of Object.values((r.variants ?? {}) as Record<string, string>)) if (typeof u === "string" && u) byUrl.set(u, r.id);
  const urls = [...byUrl.keys()];
  const used = new Set<string>();
  const add = (list: { mediaId?: string | null }[]) => list.forEach((x) => x.mediaId && used.add(x.mediaId));
  const addUrls = (list: Record<string, string | null>[]) => list.forEach((x) => Object.values(x).forEach((u) => u && byUrl.has(u) && used.add(byUrl.get(u)!)));
  const inIds = { in: mediaIds };
  const [post, project, product, tutorial, covers, digital] = await Promise.all([
    db.postMedia.findMany({ where: { mediaId: inIds }, select: { mediaId: true }, distinct: ["mediaId"] }),
    db.projectMedia.findMany({ where: { mediaId: inIds }, select: { mediaId: true }, distinct: ["mediaId"] }),
    db.productMedia.findMany({ where: { mediaId: inIds }, select: { mediaId: true }, distinct: ["mediaId"] }),
    db.tutorialMedia.findMany({ where: { mediaId: inIds }, select: { mediaId: true }, distinct: ["mediaId"] }),
    db.project.findMany({ where: { coverMediaId: inIds }, select: { coverMediaId: true } }),
    db.product.findMany({ where: { digitalKey: inIds }, select: { digitalKey: true } }),
  ]);
  add([...post, ...project, ...product, ...tutorial, ...covers.map((c) => ({ mediaId: c.coverMediaId })), ...digital.map((d) => ({ mediaId: d.digitalKey }))]);
  if (urls.length) {
    const inUrls = { in: urls };
    const res = await Promise.all([
      db.userProfile.findMany({ where: { OR: [{ avatarUrl: inUrls }, { coverUrl: inUrls }] }, select: { avatarUrl: true, coverUrl: true } }),
      db.project.findMany({ where: { coverUrl: inUrls }, select: { coverUrl: true } }),
      db.tutorial.findMany({ where: { coverUrl: inUrls }, select: { coverUrl: true } }),
      db.blogArticle.findMany({ where: { coverUrl: inUrls }, select: { coverUrl: true } }),
      db.community.findMany({ where: { coverUrl: inUrls }, select: { coverUrl: true } }),
      db.product.findMany({ where: { coverUrl: inUrls }, select: { coverUrl: true } }),
    ]);
    for (const list of res) addUrls(list);
  }
  const rest = mediaIds.filter((id) => !used.has(id));
  if (rest.length) {
    // Medien-ID im JSON-Text: deckt jede Struktur ab ({mediaId}, {id}, Blöcke); cuids kommen nicht zufällig vor
    const hits = await db.$queryRaw<{ id: string }[]>`
      SELECT m.id FROM unnest(${rest}::text[]) AS m(id)
      WHERE EXISTS (SELECT 1 FROM "ProjectUpdate" u WHERE u."authorId" = ANY(${owners}) AND strpos(u.media::text, m.id) > 0)
         OR EXISTS (SELECT 1 FROM "TutorialStep" s JOIN "TutorialVersion" v ON v.id = s."versionId" JOIN "Tutorial" t ON t.id = v."tutorialId"
                    WHERE t."authorId" = ANY(${owners}) AND strpos(s.media::text, m.id) > 0)
         OR EXISTS (SELECT 1 FROM "Message" g WHERE g."conversationId" IN (SELECT "conversationId" FROM "ConversationMember" WHERE "userId" = ANY(${owners}))
                    AND g."senderId" = ANY(${owners}) AND strpos(g.media::text, m.id) > 0)
         OR EXISTS (SELECT 1 FROM "BlogArticle" a WHERE a."authorId" = ANY(${owners}) AND strpos(a.blocks::text, m.id) > 0)
         OR EXISTS (SELECT 1 FROM "ArticleRevision" r JOIN "BlogArticle" a ON a.id = r."articleId" WHERE a."authorId" = ANY(${owners}) AND strpos(r.blocks::text, m.id) > 0)`;
    for (const h of hits) used.add(h.id);
  }
  return used;
}

/**
 * Nach dem Löschen von Inhalten: Medien, die nirgends mehr verwendet werden, wieder als „nicht verknüpft“
 * markieren (`attachedAt = null`). Die Bereinigung entfernt sie dann nach der Schonfrist (14 Tage ab
 * dieser Änderung, siehe Worker `cleanup`), in der Medienbibliothek erscheinen sie als „nicht verwendet“.
 */
export async function releaseMedia(ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return { released: 0 };
  try {
    const used = await mediaInUse(list);
    const free = list.filter((id) => !used.has(id));
    if (!free.length) return { released: 0 };
    const r = await db.media.updateMany({ where: { id: { in: free }, attachedAt: { not: null } }, data: { attachedAt: null } });
    return { released: r.count };
  } catch (e) {
    // Nie den Löschvorgang scheitern lassen – im schlimmsten Fall bleibt ein Medium länger „verknüpft“
    console.warn(JSON.stringify({ level: "warn", msg: "media_release_failed", err: e instanceof Error ? e.message.slice(0, 200) : String(e) }));
    return { released: 0 };
  }
}

/**
 * Darf ein Medium in geteilten Caches (Proxy/CDN) liegen? Nur, wenn es nachweislich an öffentlich
 * sichtbaren, veröffentlichten Inhalten hängt (öffentlicher Beitrag ausserhalb privater Communities,
 * öffentliches Projekt inkl. Cover, veröffentlichte Anleitung, aktives Produkt, Profilbild/-banner).
 * Alles andere – Nachrichten, private/Follower-Inhalte, Entwürfe, gelöschte Inhalte, nur in JSON
 * verwendete Medien – gilt konservativ als nicht öffentlich (`Cache-Control: private`).
 * Ein Index-Lookup je Medium, zusätzlich 5 Min. im Prozess zwischengespeichert.
 */
const publicCache = new Map<string, { pub: boolean; exp: number }>();
export async function isMediaPublic(mediaId: string) {
  const now = Date.now();
  const hit = publicCache.get(mediaId);
  if (hit && hit.exp > now) return hit.pub;
  const prefix = `/media/m/${mediaId}/%`;
  const rows = await db.$queryRaw<{ pub: boolean }[]>`
    SELECT (
      EXISTS (SELECT 1 FROM "PostMedia" pm JOIN "Post" p ON p.id = pm."postId" LEFT JOIN "Community" c ON c.id = p."communityId"
              WHERE pm."mediaId" = ${mediaId} AND p.state = 'PUBLISHED' AND p.visibility = 'PUBLIC' AND p."publishedAt" <= now()
                AND (p."communityId" IS NULL OR (c.visibility <> 'PRIVATE' AND c.state = 'PUBLISHED')))
      OR EXISTS (SELECT 1 FROM "ProjectMedia" x JOIN "Project" p ON p.id = x."projectId" WHERE x."mediaId" = ${mediaId} AND p.state = 'PUBLISHED' AND p.visibility = 'PUBLIC')
      OR EXISTS (SELECT 1 FROM "Media" m JOIN "Project" p ON p."ownerId" = m."ownerId" WHERE m.id = ${mediaId} AND p."coverMediaId" = m.id AND p.state = 'PUBLISHED' AND p.visibility = 'PUBLIC')
      OR EXISTS (SELECT 1 FROM "TutorialMedia" x JOIN "Tutorial" t ON t.id = x."tutorialId" WHERE x."mediaId" = ${mediaId} AND t.state = 'PUBLISHED')
      OR EXISTS (SELECT 1 FROM "ProductMedia" x JOIN "Product" p ON p.id = x."productId" WHERE x."mediaId" = ${mediaId} AND p.status IN ('ACTIVE', 'SOLD_OUT'))
      OR EXISTS (SELECT 1 FROM "Media" m JOIN "UserProfile" up ON up."userId" = m."ownerId" WHERE m.id = ${mediaId} AND (up."avatarUrl" LIKE ${prefix} OR up."coverUrl" LIKE ${prefix}))
    ) AS pub`;
  const pub = !!rows[0]?.pub;
  if (publicCache.size > 10_000) publicCache.clear();
  publicCache.set(mediaId, { pub, exp: now + 5 * 60_000 });
  return pub;
}

/** Verarbeitungsstand eines eigenen Mediums (Uploader fragt bei Videos nach). */
export async function mediaStatus(user: SessionUser, mediaId: string) {
  const m = await db.media.findUnique({ where: { id: mediaId }, select: { ownerId: true, state: true, processingError: true, variants: true } });
  if (!m || m.ownerId !== user.id) throw fail.notFound();
  return { state: m.state, error: m.processingError, variants: m.variants as Record<string, string> };
}
