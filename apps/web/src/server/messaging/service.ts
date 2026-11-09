import "server-only";
import { conversationStartSchema, messageSendSchema } from "@werkraum/shared";
import { db, Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { canMessage } from "@/server/authz";
import { emit } from "@/server/events";
import { limit } from "@/server/ratelimit";
import { notify } from "@/server/notifications";
import { relationsFor, isBlockedBetween } from "@/server/visibility";
import { attachMedia } from "@/server/media/service";
import type { SessionUser } from "@/server/auth/session";
import { publish } from "@/server/realtime/bus";
import { requireFlag } from "@/server/flags";

/**
 * Nachrichten (PRD §16). Direktnachrichten und Käufer↔Verkäufer-Unterhaltungen
 * (kind ORDER mit Bestell- bzw. Produktkontext).
 *
 * Wichtig (§16.3): Nachrichten sind serverseitig gespeichert und für die Moderation
 * bei Meldungen einsehbar. Es wird nirgends Ende-zu-Ende-Verschlüsselung versprochen.
 */

const PAGE = 50;
const MAX_UNANSWERED_REQUEST_MESSAGES = 3;

// ───────────────────────── Verdächtige Zahlungshinweise ─────────────────────────

const SUSPICIOUS_PATTERNS: RegExp[] = [
  /\btwint\b/i,
  /paypal\.me\b/i,
  /\bpaypal\b[^.\n]{0,40}\b(freunde|friends|family|familie)\b/i,
  /\biban\b/i,
  /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/,
  /western\s*union/i,
  /moneygram/i,
  /\b(?:bezahl|zahl)\w*\s+(?:(?:lieber|direkt|einfach|bitte)\s+)*(?:ausserhalb|privat|direkt|per\s+überweisung|vorab)/i,
  /ausserhalb\s+(?:der\s+|von\s+)?(?:plattform|werkraum|app|website|seite)/i,
  /\bvorkasse\b/i,
  /\b(?:bit\.ly|tinyurl\.com|t\.ly|cutt\.ly|rb\.gy|is\.gd|shorturl\.at|goo\.gl)\b/i,
  /\bwa\.me\//i,
  /\b(?:bitcoin|btc|usdt|krypto\w*|crypto)\b/i,
  /\b(?:google[- ]?play|itunes|apple|amazon|paysafe)[- ]?(?:karte|card|gutschein|code)\b/i,
  /\brevolut\.me\b/i,
];

export function detectSuspiciousPayment(text: string) {
  const t = text.normalize("NFKC");
  return SUSPICIOUS_PATTERNS.some((r) => r.test(t));
}

function flagsFor(body: string) {
  return detectSuspiciousPayment(body) ? ["SUSPICIOUS_PAYMENT_LINK"] : [];
}

// ───────────────────────── Helfer ─────────────────────────

const profileSelect = { id: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } as const;

type MediaItem = { id: string; url: string; thumb: string; alt: string; width: number | null; height: number | null };

function messageView(m: { id: string; body: string; media: unknown; flags: string[]; state: string; createdAt: Date; senderId: string; kind?: string }, viewerId: string) {
  const removed = m.state !== "PUBLISHED";
  return {
    id: m.id,
    /** Gruppenereignis („X hat Y hinzugefügt“) statt Nachricht */
    system: m.kind === "SYSTEM",
    body: removed ? "" : m.body,
    media: removed ? [] : ((Array.isArray(m.media) ? m.media : []) as MediaItem[]),
    flags: m.flags,
    removed,
    createdAt: m.createdAt.toISOString(),
    senderId: m.senderId,
    mine: m.senderId === viewerId,
  };
}
export type MessageView = ReturnType<typeof messageView>;

type LastMessage = { body: string; media: Prisma.JsonValue; senderId: string; createdAt: Date; state: string; flags: string[]; kind: string };

async function lastMessages(conversationIds: string[]) {
  const map = new Map<string, LastMessage>();
  if (!conversationIds.length) return map;
  const rows = await db.$queryRaw<(LastMessage & { conversationId: string })[]>`
    SELECT DISTINCT ON ("conversationId") "conversationId", body, media, "senderId", "createdAt", state::text AS state, flags, kind
    FROM "Message" WHERE "conversationId" IN (${Prisma.join(conversationIds)})
    ORDER BY "conversationId", "createdAt" DESC`;
  for (const r of rows) map.set(r.conversationId, r);
  return map;
}

async function membershipOrThrow(userId: string, conversationId: string) {
  const m = await db.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
  if (!m) throw fail.notFound("Unterhaltung nicht gefunden.");
  return m;
}

async function otherMembers(conversationId: string, userId: string) {
  return db.conversationMember.findMany({ where: { conversationId, userId: { not: userId } }, include: { user: { select: profileSelect } } });
}

const isDeclined = (m: { isRequest: boolean; archivedAt: Date | null }) => m.isRequest && !!m.archivedAt;

// ───────────────────────── Posteingang ─────────────────────────

export type InboxBox = "inbox" | "requests" | "archived";

export async function listConversations(userId: string, box: InboxBox = "inbox", take = 60) {
  const rel = await relationsFor(userId);
  const where: Prisma.ConversationMemberWhereInput =
    box === "requests" ? { archivedAt: null, isRequest: true } : box === "archived" ? { archivedAt: { not: null }, isRequest: false } : { archivedAt: null, isRequest: false };
  const rows = await db.conversationMember.findMany({
    where: {
      userId,
      ...where,
      conversation: {
        messages: { some: {} },
        // Blockierte Personen blenden Einzelgespräche aus – Gruppen bleiben sichtbar
        ...(rel.blocked.length ? { OR: [{ kind: "GROUP" }, { members: { none: { userId: { in: rel.blocked } } } }] } : {}),
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take,
    include: {
      conversation: {
        include: {
          members: { where: { userId: { not: userId } }, include: { user: { select: profileSelect } } },
        },
      },
    },
  });
  // Letzte Nachricht je Gespräch in EINER Abfrage (Prisma würde sonst alle Nachrichten laden und erst
  // im Speicher auf eine kürzen – bei aktiven Chats zehntausende Zeilen pro Posteingang)
  const lastByConv = await lastMessages(rows.map((r) => r.conversationId));
  const orderIds = rows.map((r) => r.conversation.orderId).filter((x): x is string => !!x);
  const orders = orderIds.length ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } }) : [];
  const onum = new Map(orders.map((o) => [o.id, o.number]));
  return rows.map((r) => {
    const c = r.conversation;
    const other = c.members[0]?.user;
    const last = lastByConv.get(c.id);
    const unread = !!last && last.senderId !== userId && (!r.lastReadAt || r.lastReadAt < c.lastMessageAt);
    const isGroup = c.kind === "GROUP";
    const text = !last ? "" : last.state !== "PUBLISHED" ? "Nachricht entfernt" : last.body ? last.body.slice(0, 140) : Array.isArray(last.media) && last.media.length ? "Bild" : "";
    // Gruppen: Absender:in vor die Vorschau (ausser bei Systemhinweisen und eigenen Nachrichten)
    const sender = isGroup && last && last.senderId !== userId && last.kind !== "SYSTEM" ? c.members.find((m) => m.userId === last.senderId)?.user.profile?.displayName?.split(" ")[0] : null;
    const preview = sender ? `${sender}: ${text}` : text;
    return {
      id: c.id,
      kind: c.kind as "DIRECT" | "ORDER" | "GROUP",
      group: isGroup ? { title: c.title ?? "Gruppe", memberCount: c.members.length + 1, avatars: c.members.slice(0, 2).map((m) => ({ name: m.user.profile?.displayName ?? "", avatarUrl: m.user.profile?.avatarUrl ?? null })) } : null,
      orderNumber: c.orderId ? onum.get(c.orderId) ?? null : null,
      isProductInquiry: c.kind === "ORDER" && !c.orderId && !!c.productId,
      lastMessageAt: c.lastMessageAt.toISOString(),
      preview,
      lastFromMe: last?.senderId === userId && last.kind !== "SYSTEM",
      flagged: !!last?.flags.includes("SUSPICIOUS_PAYMENT_LINK") && last.senderId !== userId,
      unread,
      other: other
        ? { id: other.id, handle: other.profile?.handle ?? "", displayName: other.status === "DELETED" ? "Gelöschtes Konto" : other.profile?.displayName ?? "Unbekannt", avatarUrl: other.profile?.avatarUrl ?? null }
        : { id: "", handle: "", displayName: "Unbekannt", avatarUrl: null },
    };
  });
}
export type ConversationListItem = Awaited<ReturnType<typeof listConversations>>[number];

export async function inboxCounts(userId: string) {
  const rel = await relationsFor(userId);
  const notBlocked = rel.blocked.length ? { OR: [{ kind: "GROUP" }, { members: { none: { userId: { in: rel.blocked } } } }] } : {};
  const [requests, unread] = await Promise.all([
    db.conversationMember.count({ where: { userId, isRequest: true, archivedAt: null, conversation: { messages: { some: {} }, ...notBlocked } } }),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM "ConversationMember" cm
      JOIN "Conversation" c ON c.id = cm."conversationId"
      WHERE cm."userId" = ${userId} AND cm."archivedAt" IS NULL AND cm."isRequest" = false
        AND (cm."lastReadAt" IS NULL OR cm."lastReadAt" < c."lastMessageAt")
        AND EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = c.id AND m."senderId" <> ${userId})`.then((r) => Number(r[0]?.n ?? 0)),
  ]);
  return { requests, unread };
}

// ───────────────────────── Unterhaltung ─────────────────────────

async function orderContext(conv: { orderId: string | null; productId: string | null }, viewerId: string) {
  if (conv.orderId) {
    const o = await db.order.findUnique({
      where: { id: conv.orderId },
      select: {
        id: true,
        number: true,
        status: true,
        totalMinor: true,
        currency: true,
        createdAt: true,
        buyerId: true,
        shop: { select: { name: true, slug: true, ownerId: true } },
        items: { select: { title: true, quantity: true, variantName: true, product: { select: { coverUrl: true } } }, take: 4 },
        _count: { select: { items: true } },
      },
    });
    if (!o) return null;
    const role = o.buyerId === viewerId ? ("buyer" as const) : o.shop.ownerId === viewerId ? ("seller" as const) : null;
    return {
      type: "order" as const,
      role,
      number: o.number,
      status: o.status,
      totalMinor: o.totalMinor,
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      shop: { name: o.shop.name, slug: o.shop.slug },
      items: o.items.map((i) => ({ title: i.title, quantity: i.quantity, variantName: i.variantName, coverUrl: i.product.coverUrl })),
      itemCount: o._count.items,
      href: role === "seller" ? `/studio/bestellungen/${o.id}` : `/bestellungen/${o.id}`,
    };
  }
  if (conv.productId) {
    const p = await db.product.findUnique({ where: { id: conv.productId }, select: { title: true, slug: true, coverUrl: true, priceMinor: true, currency: true, status: true, shop: { select: { name: true, slug: true } } } });
    if (!p) return null;
    return { type: "product" as const, title: p.title, coverUrl: p.coverUrl, priceMinor: p.priceMinor, currency: p.currency, status: p.status, shop: p.shop, href: `/markt/${p.shop.slug}/${p.slug}` };
  }
  return null;
}
export type OrderContext = NonNullable<Awaited<ReturnType<typeof orderContext>>>;

export async function getThread(user: SessionUser, conversationId: string, opts: { before?: string } = {}) {
  const me = await membershipOrThrow(user.id, conversationId);
  const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  const others = await otherMembers(conversationId, user.id);
  const isGroup = conv.kind === "GROUP";
  const other = isGroup ? undefined : others[0];
  if (other && (await isBlockedBetween(user.id, other.userId))) throw fail.notFound("Unterhaltung nicht gefunden.");
  const before = opts.before ? new Date(opts.before) : null;
  // Gruppen: Verlauf erst ab dem Beitritt (bzw. der Einladung) – frühere Nachrichten bleiben den
  // bisherigen Mitgliedern vorbehalten
  const joined = isGroup ? { gte: me.joinedAt } : {};
  const rows = await db.message.findMany({
    where: { conversationId, createdAt: { ...joined, ...(before && !Number.isNaN(before.getTime()) ? { lt: before } : {}) } },
    orderBy: { createdAt: "desc" },
    take: PAGE + 1,
  });
  const hasMore = rows.length > PAGE;
  const messages = rows.slice(0, PAGE).reverse().map((m) => messageView(m, user.id));
  const ownCount = await db.message.count({ where: { conversationId, senderId: user.id } });
  const group = isGroup
    ? {
        title: conv.title ?? "Gruppe",
        isAdmin: me.role === "ADMIN",
        // Alle aktuellen Mitglieder inkl. mir (für Namen über den Nachrichten und die Mitgliederliste)
        members: [
          { userId: user.id, role: me.role, isRequest: me.isRequest, archivedAt: me.archivedAt, user: { id: user.id, status: "ACTIVE", profile: user.profile } },
          ...others,
        ]
          .filter((m) => !isDeclined(m))
          .map((m) => ({
            id: m.userId,
            handle: m.user.profile?.handle ?? "",
            displayName: m.user.status === "DELETED" ? "Gelöschtes Konto" : m.user.profile?.displayName ?? "Unbekannt",
            avatarUrl: m.user.profile?.avatarUrl ?? null,
            role: m.role as "ADMIN" | "MEMBER",
            pending: m.isRequest,
            me: m.userId === user.id,
          })),
      }
    : null;
  return {
    id: conv.id,
    kind: conv.kind as "DIRECT" | "ORDER" | "GROUP",
    group,
    messages,
    hasMore,
    me: { isRequest: me.isRequest, archived: !!me.archivedAt, lastReadAt: me.lastReadAt?.toISOString() ?? null },
    other: other
      ? {
          id: other.userId,
          handle: other.user.profile?.handle ?? "",
          displayName: other.user.status === "DELETED" ? "Gelöschtes Konto" : other.user.profile?.displayName ?? "Unbekannt",
          avatarUrl: other.user.profile?.avatarUrl ?? null,
          active: other.user.status === "ACTIVE",
          // Lesebestätigung erst, wenn die Kontaktanfrage angenommen wurde
          lastReadAt: other.isRequest ? null : other.lastReadAt?.toISOString() ?? null,
          pendingRequest: other.isRequest && !other.archivedAt,
          declined: isDeclined(other),
        }
      : null,
    context: await orderContext(conv, user.id),
    canSend: isGroup ? canMessage(user) && others.length > 0 : canMessage(user) && !!other && other.user.status === "ACTIVE" && !isDeclined(other),
    requestQuotaLeft: other?.isRequest ? Math.max(0, MAX_UNANSWERED_REQUEST_MESSAGES - ownCount) : null,
    messagingRestrictedUntil: !canMessage(user) ? user.messagingRestrictedUntil?.toISOString() ?? null : null,
  };
}
export type ThreadData = Awaited<ReturnType<typeof getThread>>;

/** Für das Polling: neue Nachrichten seit Zeitpunkt + Lesestand der Gegenseite. */
export async function messagesSince(user: SessionUser, conversationId: string, after: string | null) {
  const me = await membershipOrThrow(user.id, conversationId);
  const since = after ? new Date(after) : null;
  const kind = (await db.conversation.findUnique({ where: { id: conversationId }, select: { kind: true } }))?.kind;
  const joined = kind === "GROUP" ? { gte: me.joinedAt } : {};
  const [rows, others] = await Promise.all([
    db.message.findMany({
      where: { conversationId, createdAt: { ...joined, ...(since && !Number.isNaN(since.getTime()) ? { gt: since } : {}) } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    otherMembers(conversationId, user.id),
  ]);
  const isGroup = kind === "GROUP";
  // Gruppen: keine Lesebestätigungen und keine Blockier-Sperre
  const other = isGroup ? undefined : others[0];
  if (other && (await isBlockedBetween(user.id, other.userId))) throw fail.notFound();
  return {
    messages: rows.map((m) => messageView(m, user.id)),
    otherLastReadAt: other && !other.isRequest ? other.lastReadAt?.toISOString() ?? null : null,
    otherPendingRequest: !!other && other.isRequest && !other.archivedAt,
  };
}

// ───────────────────────── Senden ─────────────────────────

async function buildMedia(tx: Prisma.TransactionClient, userId: string, refs: { id: string; alt: string }[]) {
  if (!refs.length) return [] as MediaItem[];
  await attachMedia(tx, userId, refs.map((r) => r.id));
  const rows = await tx.media.findMany({ where: { id: { in: refs.map((r) => r.id) } }, select: { id: true, kind: true, variants: true, width: true, height: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return refs.map((r) => {
    const m = byId.get(r.id);
    if (m?.kind !== "IMAGE") throw fail.invalid("In Nachrichten sind nur Bilder erlaubt.");
    const v = (m.variants ?? {}) as Record<string, string>;
    return { id: r.id, url: v.lg ?? v.md ?? v.sm ?? "", thumb: v.sm ?? v.md ?? "", alt: r.alt, width: m.width, height: m.height };
  });
}

export function assertCanMessage(user: SessionUser) {
  if (!canMessage(user)) {
    const until = user.messagingRestrictedUntil?.toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" });
    throw fail.forbidden(`Deine Nachrichtenfunktion ist${until ? ` bis ${until}` : ""} eingeschränkt.`);
  }
}

export async function sendMessage(user: SessionUser, conversationId: string, input: unknown) {
  const data = messageSendSchema.parse(input);
  assertCanMessage(user);
  const me = await membershipOrThrow(user.id, conversationId);
  const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { kind: true, title: true } });
  const isGroup = conv.kind === "GROUP";
  // Gruppen: an alle Mitglieder ausser abgelehnten Einladungen; Blockieren gilt hier nicht als Sperre
  const others = (await otherMembers(conversationId, user.id)).filter((o) => !isGroup || !isDeclined(o));
  if (!others.length) throw fail.invalid(isGroup ? "In dieser Gruppe ist sonst niemand mehr." : "Diese Unterhaltung hat keine Empfänger:innen mehr.");
  for (const o of isGroup ? [] : others) {
    if (await isBlockedBetween(user.id, o.userId)) throw fail.forbidden("Du kannst dieser Person keine Nachrichten senden.");
    if (o.user.status !== "ACTIVE") throw fail.forbidden("Dieses Konto kann derzeit keine Nachrichten empfangen.");
    if (isDeclined(o)) throw fail.forbidden("Diese Nachricht kann nicht zugestellt werden.");
  }
  if (!isGroup && others.some((o) => o.isRequest)) {
    const sent = await db.message.count({ where: { conversationId, senderId: user.id } });
    if (sent >= MAX_UNANSWERED_REQUEST_MESSAGES) throw fail.invalid("Warte, bis deine Kontaktanfrage angenommen wurde, bevor du weitere Nachrichten schickst.");
  }
  await limit("message", user.id);
  const flags = flagsFor(data.body);
  const message = await db.$transaction(async (tx) => {
    const media = await buildMedia(tx, user.id, data.media);
    const m = await tx.message.create({ data: { conversationId, senderId: user.id, body: data.body, media: media as unknown as Prisma.InputJsonValue, flags } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: m.createdAt } });
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      // Antworten nimmt eine eigene Kontaktanfrage automatisch an
      data: { lastReadAt: m.createdAt, archivedAt: null, ...(me.isRequest ? { isRequest: false } : {}) },
    });
    await tx.conversationMember.updateMany({ where: { conversationId, userId: { not: user.id }, archivedAt: { not: null }, isRequest: false }, data: { archivedAt: null } });
    await emit({ type: "MessageSent", messageId: m.id, conversationId }, tx);
    return m;
  });
  // Live: alle Beteiligten (auch eigene weitere Tabs) sofort informieren
  void publish([user.id, ...others.map((o) => o.userId)], { t: "message", c: conversationId });
  const excerpt = data.body ? data.body.slice(0, 120) : "Hat dir ein Bild geschickt.";
  // Erste Nachricht einer Kontaktanfrage: genau eine Benachrichtigung pro Unterhaltung
  // (weitere Nachrichten sind bis zur Annahme ohnehin begrenzt → kein Spam-Kanal)
  const firstRequestMessage = !isGroup && others.some((o) => o.isRequest) && (await db.message.count({ where: { conversationId, senderId: user.id } })) === 1;
  for (const o of others) {
    if (isGroup) {
      // Offene Einladungen und inaktive Konten nicht anpingen
      if (o.isRequest || o.user.status !== "ACTIVE") continue;
      await notify({
        recipientId: o.userId,
        type: "MESSAGE",
        actorId: user.id,
        targetType: "MESSAGE",
        targetId: conversationId,
        data: { group: conv.title ?? "Gruppe", href: `/nachrichten/${conversationId}`, excerpt: flags.length ? "Neue Nachricht" : excerpt },
      }).catch(() => {});
      continue;
    }
    if (o.isRequest) {
      if (!firstRequestMessage) continue;
      await notify({
        recipientId: o.userId,
        type: "MESSAGE",
        actorId: user.id,
        targetType: "MESSAGE",
        targetId: conversationId,
        bundle: false,
        data: { kind: "request", title: user.profile?.displayName ?? "Kontaktanfrage", href: "/nachrichten?ordner=anfragen", excerpt: flags.length ? "Neue Kontaktanfrage" : excerpt },
      });
      continue;
    }
    await notify({
      recipientId: o.userId,
      type: "MESSAGE",
      actorId: user.id,
      targetType: "MESSAGE",
      targetId: conversationId,
      data: { title: user.profile?.displayName ?? "Neue Nachricht", href: `/nachrichten/${conversationId}`, excerpt: flags.length ? "Neue Nachricht" : excerpt },
    });
  }
  return messageView(message, user.id);
}

// ───────────────────────── Unterhaltung beginnen ─────────────────────────

async function findDirect(a: string, b: string) {
  return db.conversation.findFirst({
    where: { kind: "DIRECT", AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }] },
    select: { id: true },
  });
}

async function findContextual(a: string, b: string, ctx: { orderId?: string | null; productId?: string | null }) {
  return db.conversation.findFirst({
    where: {
      kind: "ORDER",
      ...(ctx.orderId ? { orderId: ctx.orderId } : { orderId: null, productId: ctx.productId }),
      AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }],
    },
    select: { id: true },
  });
}

/**
 * Vorprüfung für /nachrichten/neu: Empfänger:in, Kontext, bestehende Unterhaltung,
 * und ob eine Nachricht möglich ist bzw. als Kontaktanfrage zugestellt wird.
 */
export async function prepareConversation(user: SessionUser, input: { handle: string; orderId?: string | null; productId?: string | null }) {
  const handle = input.handle.trim().replace(/^@/, "").toLowerCase();
  const profile = await db.userProfile.findUnique({ where: { handle }, select: { userId: true, handle: true, displayName: true, avatarUrl: true, bio: true, dmPolicy: true, user: { select: { status: true } } } });
  const redirect = profile ? null : await db.handleRedirect.findUnique({ where: { oldHandle: handle }, select: { profile: { select: { handle: true } } } });
  if (!profile) return { kind: "not_found" as const, redirectHandle: redirect?.profile.handle ?? null };
  const recipient = { id: profile.userId, handle: profile.handle, displayName: profile.displayName, avatarUrl: profile.avatarUrl, bio: profile.bio };
  if (profile.userId === user.id) return { kind: "self" as const, recipient };
  if (profile.user.status !== "ACTIVE" || (await isBlockedBetween(user.id, profile.userId))) return { kind: "unavailable" as const, recipient };

  let context: { orderId?: string; productId?: string; label: string } | null = null;
  if (input.orderId) {
    const o = await db.order.findUnique({ where: { id: input.orderId }, select: { id: true, number: true, buyerId: true, shop: { select: { ownerId: true } } } });
    const parties = o ? [o.buyerId, o.shop.ownerId] : [];
    if (!o || !parties.includes(user.id) || !parties.includes(profile.userId)) return { kind: "bad_context" as const, recipient };
    context = { orderId: o.id, label: `Bestellung ${o.number}` };
  } else if (input.productId) {
    const p = await db.product.findUnique({ where: { id: input.productId }, select: { id: true, title: true, status: true, shop: { select: { ownerId: true } } } });
    if (!p || p.shop.ownerId !== profile.userId || !["ACTIVE", "SOLD_OUT", "PAUSED"].includes(p.status)) return { kind: "bad_context" as const, recipient };
    context = { productId: p.id, label: p.title };
  }

  const existing = context ? await findContextual(user.id, profile.userId, context) : await findDirect(user.id, profile.userId);
  if (existing) return { kind: "existing" as const, recipient, conversationId: existing.id };

  if (!canMessage(user)) return { kind: "restricted" as const, recipient, until: user.messagingRestrictedUntil?.toISOString() ?? null };
  if (context) return { kind: "ok" as const, recipient, context, asRequest: false };
  const policy = profile.dmPolicy;
  if (policy === "NOBODY") return { kind: "closed" as const, recipient };
  let asRequest = false;
  if (policy !== "EVERYONE") {
    const follows = await db.follow.findUnique({ where: { followerId_followeeId: { followerId: profile.userId, followeeId: user.id } }, select: { followerId: true } });
    asRequest = !follows;
  }
  return { kind: "ok" as const, recipient, context: null, asRequest };
}

export async function startConversation(user: SessionUser, input: unknown) {
  const data = conversationStartSchema.parse(input);
  const body = messageSendSchema.parse({ body: data.body, media: data.media });
  const prep = await prepareConversation(user, { handle: data.recipientHandle, orderId: data.orderId, productId: data.productId });
  switch (prep.kind) {
    case "existing":
      await sendMessage(user, prep.conversationId, body);
      return { conversationId: prep.conversationId, asRequest: false };
    case "not_found":
      throw fail.notFound("Kein Profil mit diesem Namen gefunden.");
    case "self":
      throw fail.invalid("Du kannst dir nicht selbst schreiben.");
    case "unavailable":
      throw fail.forbidden("Du kannst dieser Person keine Nachrichten senden.");
    case "bad_context":
      throw fail.forbidden("Diese Bestellung bzw. dieses Produkt gehört nicht zu euch beiden.");
    case "restricted":
      assertCanMessage(user);
      throw fail.forbidden();
    case "closed":
      throw fail.forbidden(`${prep.recipient.displayName} nimmt keine Direktnachrichten an.`);
    case "ok":
      await requireFlag("messages.new", user.id);
      break;
  }
  await limit("newConversation", user.id);
  const conv = await db.$transaction(async (tx) => {
    let productId = prep.context?.productId ?? null;
    if (prep.context?.orderId) {
      const first = await tx.orderItem.findFirst({ where: { orderId: prep.context.orderId }, select: { productId: true } });
      productId = first?.productId ?? null;
    }
    return tx.conversation.create({
      data: {
        kind: prep.context ? "ORDER" : "DIRECT",
        orderId: prep.context?.orderId ?? null,
        productId,
        members: {
          create: [
            { userId: user.id, lastReadAt: new Date() },
            { userId: prep.recipient.id, isRequest: prep.asRequest },
          ],
        },
      },
    });
  });
  try {
    await sendMessage(user, conv.id, body);
  } catch (e) {
    await db.conversation.delete({ where: { id: conv.id } }).catch(() => {});
    throw e;
  }
  return { conversationId: conv.id, asRequest: prep.asRequest };
}

// ───────────────────────── Status ─────────────────────────

export async function markRead(user: SessionUser, conversationId: string) {
  await membershipOrThrow(user.id, conversationId);
  const now = new Date();
  await db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadAt: now } });
  await db.notification.updateMany({ where: { recipientId: user.id, groupKey: `MESSAGE:MESSAGE:${conversationId}`, readAt: null }, data: { readAt: now } });
  // Lesebestätigung für die andere Seite und Zähler in weiteren eigenen Tabs
  const others = await db.conversationMember.findMany({ where: { conversationId, userId: { not: user.id } }, select: { userId: true } });
  void publish([user.id, ...others.map((o) => o.userId)], { t: "read", c: conversationId });
  return { lastReadAt: now.toISOString() };
}

export async function setArchived(user: SessionUser, conversationId: string, archived: boolean) {
  const m = await membershipOrThrow(user.id, conversationId);
  if (m.isRequest) throw fail.invalid("Nimm die Anfrage zuerst an oder lehne sie ab.");
  await db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { archivedAt: archived ? new Date() : null } });
  return { archived };
}

export async function respondToRequest(user: SessionUser, conversationId: string, accept: boolean) {
  const m = await membershipOrThrow(user.id, conversationId);
  if (!m.isRequest) return { accepted: true };
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, select: { kind: true } });
  if (conv?.kind === "GROUP" && !accept) {
    // Gruppeneinladung ablehnen: still aus der Gruppe entfernen
    await db.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId: user.id } } });
    await db.notification.updateMany({ where: { recipientId: user.id, targetType: "MESSAGE", targetId: conversationId, readAt: null }, data: { readAt: new Date() } });
    void publish([user.id], { t: "counts" });
    return { accepted: false };
  }
  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: accept ? { isRequest: false, archivedAt: null, lastReadAt: new Date() } : { archivedAt: new Date() },
  });
  if (accept && conv?.kind === "GROUP") {
    const m2 = await db.message.create({ data: { conversationId, senderId: user.id, body: `${user.profile?.displayName ?? "Jemand"} ist der Gruppe beigetreten.`, kind: "SYSTEM" } });
    await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: m2.createdAt } });
    const all = await db.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
    void publish(all.map((x) => x.userId), { t: "message", c: conversationId });
  }
  await db.notification.updateMany({ where: { recipientId: user.id, targetType: "MESSAGE", targetId: conversationId, readAt: null }, data: { readAt: new Date() } });
  void publish([user.id], { t: "counts" });
  return { accepted: accept };
}
