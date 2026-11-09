import "server-only";
import { GROUP_MAX_MEMBERS, groupAddMembersSchema, groupCreateSchema, groupTitleSchema, messageSendSchema } from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { limit } from "@/server/ratelimit";
import { notify } from "@/server/notifications";
import { isBlockedBetween } from "@/server/visibility";
import { canMessage } from "@/server/authz";
import { publish } from "@/server/realtime/bus";
import { requireFlag } from "@/server/flags";
import type { SessionUser } from "@/server/auth/session";
import { requireAdult } from "@/server/auth/adult";
import { sendMessage } from "./service";

/**
 * Gruppenchats (bis 25 Personen). Ersteller:in ist Admin: Mitglieder hinzufügen/entfernen,
 * umbenennen. Alle können die Gruppe verlassen.
 *
 * Privatsphäre wie bei Direktnachrichten: Wer „Nur Personen, denen ich folge“ eingestellt hat
 * und der einladenden Person nicht folgt, erhält eine Einladung (Ordner „Anfragen“) statt
 * direkt Mitglied zu werden. „Niemand“ und Blockierungen verhindern das Hinzufügen.
 */

type Invitee = { id: string; displayName: string; asRequest: boolean };

const displayName = (u: SessionUser) => u.profile?.displayName ?? "Jemand";
const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`);

/** Prüft Profilnamen und liefert Personen, die hinzugefügt werden dürfen – sonst Fehler mit Namen. */
async function resolveInvitees(user: SessionUser, handles: string[], exclude: Set<string>): Promise<Invitee[]> {
  const clean = [...new Set(handles.map((h) => h.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))];
  const profiles = await db.userProfile.findMany({
    where: { handle: { in: clean } },
    select: { userId: true, handle: true, displayName: true, dmPolicy: true, user: { select: { status: true } } },
  });
  const found = new Map(profiles.map((p) => [p.handle, p]));
  const missing = clean.filter((h) => !found.has(h));
  if (missing.length) throw fail.invalid(`Nicht gefunden: ${missing.map((h) => `@${h}`).join(", ")}`, { handles: "Profil nicht gefunden" });
  const out: Invitee[] = [];
  const blocked: string[] = [];
  const closed: string[] = [];
  for (const p of profiles) {
    if (p.userId === user.id || exclude.has(p.userId)) continue;
    if (p.user.status !== "ACTIVE" || (await isBlockedBetween(user.id, p.userId))) {
      blocked.push(p.displayName);
      continue;
    }
    if (p.dmPolicy === "NOBODY") {
      closed.push(p.displayName);
      continue;
    }
    let asRequest = false;
    if (p.dmPolicy !== "EVERYONE") {
      const follows = await db.follow.findUnique({ where: { followerId_followeeId: { followerId: p.userId, followeeId: user.id } }, select: { followerId: true } });
      asRequest = !follows;
    }
    out.push({ id: p.userId, displayName: p.displayName, asRequest });
  }
  if (blocked.length) throw fail.forbidden(`${list(blocked)} ${blocked.length > 1 ? "können" : "kann"} nicht hinzugefügt werden.`);
  if (closed.length) throw fail.forbidden(`${list(closed)} ${closed.length > 1 ? "nehmen" : "nimmt"} keine Nachrichten an.`);
  return out;
}

/** Hinweis im Verlauf („Lena hat Mattia hinzugefügt“), zählt als Aktivität der Unterhaltung. */
async function systemMessage(conversationId: string, actorId: string, body: string) {
  const m = await db.message.create({ data: { conversationId, senderId: actorId, body, kind: "SYSTEM" } });
  await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: m.createdAt } });
  const members = await db.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
  void publish(members.map((x) => x.userId), { t: "message", c: conversationId });
}

async function notifyInvitees(user: SessionUser, conversationId: string, title: string, invitees: Invitee[]) {
  for (const i of invitees) {
    await notify({
      recipientId: i.id,
      type: "MESSAGE",
      actorId: user.id,
      targetType: "MESSAGE",
      targetId: conversationId,
      bundle: false,
      data: { kind: i.asRequest ? "group_invite" : "group_added", group: title, href: i.asRequest ? "/nachrichten?ordner=anfragen" : `/nachrichten/${conversationId}` },
    }).catch(() => {});
  }
}

async function groupOrThrow(user: SessionUser, conversationId: string) {
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, select: { id: true, kind: true, title: true } });
  const me = conv ? await db.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: user.id } } }) : null;
  if (!conv || conv.kind !== "GROUP" || !me) throw fail.notFound("Gruppe nicht gefunden.");
  return { conv, me };
}

async function requireAdmin(user: SessionUser, conversationId: string) {
  const g = await groupOrThrow(user, conversationId);
  if (g.me.role !== "ADMIN") throw fail.forbidden("Nur Gruppen-Admins können das.");
  return g;
}

export async function createGroup(user: SessionUser, input: unknown) {
  const data = groupCreateSchema.parse(input);
  if (!canMessage(user)) throw fail.forbidden("Deine Nachrichtenfunktion ist eingeschränkt.");
  await requireFlag("messages.new", user.id);
  const invitees = await resolveInvitees(user, data.handles, new Set());
  if (invitees.length < 2) throw fail.invalid("Wähle mindestens zwei Personen.", { handles: "Mindestens zwei Personen" });
  if (invitees.length + 1 > GROUP_MAX_MEMBERS) throw fail.invalid(`Höchstens ${GROUP_MAX_MEMBERS} Personen pro Gruppe.`);
  await requireAdult(user);
  await limit("newConversation", user.id);
  const conv = await db.conversation.create({
    data: {
      kind: "GROUP",
      title: data.title,
      createdById: user.id,
      members: {
        create: [{ userId: user.id, role: "ADMIN", lastReadAt: new Date() }, ...invitees.map((i) => ({ userId: i.id, isRequest: i.asRequest }))],
      },
    },
  });
  await systemMessage(conv.id, user.id, `${displayName(user)} hat die Gruppe „${data.title}“ erstellt.`);
  await notifyInvitees(user, conv.id, data.title, invitees);
  if (data.body) await sendMessage(user, conv.id, messageSendSchema.parse({ body: data.body, media: [] }));
  return { conversationId: conv.id, invited: invitees.filter((i) => i.asRequest).map((i) => i.displayName) };
}

export async function addGroupMembers(user: SessionUser, conversationId: string, input: unknown) {
  const data = groupAddMembersSchema.parse(input);
  // Wer eine Nachrichtensperre hat, lädt auch niemanden ein (sonst gingen Benachrichtigungen an bis zu 25 Personen)
  if (!canMessage(user)) throw fail.forbidden("Deine Nachrichtenfunktion ist eingeschränkt.");
  await requireFlag("messages.new", user.id);
  const { conv } = await requireAdmin(user, conversationId);
  const current = await db.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
  const invitees = await resolveInvitees(user, data.handles, new Set(current.map((c) => c.userId)));
  if (!invitees.length) throw fail.invalid("Diese Personen sind schon in der Gruppe.");
  if (current.length + invitees.length > GROUP_MAX_MEMBERS) throw fail.invalid(`Höchstens ${GROUP_MAX_MEMBERS} Personen pro Gruppe.`);
  await requireAdult(user);
  await limit("message", user.id);
  await db.conversationMember.createMany({ data: invitees.map((i) => ({ conversationId, userId: i.id, isRequest: i.asRequest })), skipDuplicates: true });
  const direct = invitees.filter((i) => !i.asRequest).map((i) => i.displayName);
  const invited = invitees.filter((i) => i.asRequest).map((i) => i.displayName);
  if (direct.length) await systemMessage(conversationId, user.id, `${displayName(user)} hat ${list(direct)} hinzugefügt.`);
  if (invited.length) await systemMessage(conversationId, user.id, `${displayName(user)} hat ${list(invited)} eingeladen.`);
  await notifyInvitees(user, conversationId, conv.title ?? "Gruppe", invitees);
  return { added: direct, invited };
}

export async function removeGroupMember(user: SessionUser, conversationId: string, userId: string) {
  await requireAdmin(user, conversationId);
  if (userId === user.id) throw fail.invalid("Um die Gruppe zu verlassen, nutze „Gruppe verlassen“.");
  const m = await db.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } }, include: { user: { select: { profile: { select: { displayName: true } } } } } });
  if (!m) throw fail.notFound("Diese Person ist nicht in der Gruppe.");
  await db.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId } } });
  if (!m.isRequest) await systemMessage(conversationId, user.id, `${displayName(user)} hat ${m.user.profile?.displayName ?? "jemanden"} entfernt.`);
  void publish([userId], { t: "counts" });
  return { removed: true };
}

export async function leaveGroup(user: SessionUser, conversationId: string) {
  const { me } = await groupOrThrow(user, conversationId);
  await db.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId: user.id } } });
  const rest = await db.conversationMember.findMany({ where: { conversationId }, orderBy: { joinedAt: "asc" }, select: { userId: true, role: true, isRequest: true } });
  const active = rest.filter((r) => !r.isRequest);
  if (!active.length) {
    // Niemand mehr aktiv: Gruppe samt offenen Einladungen auflösen
    await db.conversation.delete({ where: { id: conversationId } });
    return { left: true, dissolved: true };
  }
  if (me.role === "ADMIN" && !active.some((r) => r.role === "ADMIN")) {
    // Letzte:r Admin geht → längstes Mitglied übernimmt
    await db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: active[0]!.userId } }, data: { role: "ADMIN" } });
  }
  if (!me.isRequest) await systemMessage(conversationId, user.id, `${displayName(user)} hat die Gruppe verlassen.`);
  void publish([user.id], { t: "counts" });
  return { left: true, dissolved: false };
}

export async function renameGroup(user: SessionUser, conversationId: string, title: unknown) {
  const t = groupTitleSchema.parse(title);
  if (!canMessage(user)) throw fail.forbidden("Deine Nachrichtenfunktion ist eingeschränkt.");
  const { conv } = await requireAdmin(user, conversationId);
  if (conv.title === t) return { title: t };
  await db.conversation.update({ where: { id: conversationId }, data: { title: t } });
  await systemMessage(conversationId, user.id, `${displayName(user)} hat die Gruppe in „${t}“ umbenannt.`);
  return { title: t };
}

export async function setGroupAdmin(user: SessionUser, conversationId: string, userId: string, admin: boolean) {
  await requireAdmin(user, conversationId);
  const m = await db.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
  if (!m || m.isRequest) throw fail.notFound("Diese Person ist nicht in der Gruppe.");
  if (!admin && userId === user.id) {
    const admins = await db.conversationMember.count({ where: { conversationId, role: "ADMIN" } });
    if (admins <= 1) throw fail.invalid("Die Gruppe braucht mindestens eine:n Admin.");
  }
  await db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId } }, data: { role: admin ? "ADMIN" : "MEMBER" } });
  return { admin };
}

/** Vorschläge für die Mitgliederauswahl: Personen, denen ich folge (alphabetisch). */
export async function groupCandidates(user: SessionUser, take = 200) {
  const rows = await db.follow.findMany({
    where: { followerId: user.id, followee: { status: "ACTIVE", profile: { isNot: null } } },
    take,
    select: { followee: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
  });
  return rows
    .map((r) => ({ id: r.followee.id, handle: r.followee.profile!.handle, displayName: r.followee.profile!.displayName, avatarUrl: r.followee.profile!.avatarUrl }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
}
