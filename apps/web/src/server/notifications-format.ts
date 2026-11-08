import "server-only";
import {
  MODERATION_ACTION_LABEL,
  NOTIFICATION_TYPES,
  ORDER_STATUS_LABEL,
  type ModerationActionKind,
  type NotificationType,
  type OrderStatus,
} from "@werkraum/shared";

/**
 * Deutsche Texte für Benachrichtigungen (PRD §19). Gebündelte Einträge
 * (Notification.count > 1) werden als „Anna und 11 weitere …“ formuliert.
 * Die Funktionen sind rein und werden von Web (/benachrichtigungen) und
 * API (/api/v1/notifications → iOS) gleichermassen genutzt.
 */

export type NotificationLike = {
  type: string;
  count: number;
  targetType?: string | null;
  data: unknown;
  actor?: { profile?: { displayName?: string | null; handle?: string | null } | null } | null;
};

export type NotificationParts = {
  /** Fett dargestellter Auftakt, z.B. „Anna und 11 weitere“ – null bei Systemmeldungen. */
  lead: string | null;
  /** Restlicher Satz ohne Auftakt. */
  text: string;
  /** Optionaler Auszug (Kommentartext, Begründung). */
  excerpt: string | null;
};

export type NotificationGroup = "mentions" | "projects" | "shop" | "system";

/** Filter-Tabs auf /benachrichtigungen. */
export const NOTIFICATION_FILTERS: { key: "all" | NotificationGroup; label: string; types: NotificationType[] | null }[] = [
  { key: "all", label: "Alle", types: null },
  { key: "mentions", label: "Erwähnungen", types: ["MENTION", "REPLY", "COMMENT"] },
  { key: "projects", label: "Projekte", types: ["PROJECT_ACTIVITY", "REMIX", "TUTORIAL_UPDATED"] },
  { key: "shop", label: "Shop", types: ["ORDER_NEW", "ORDER_STATUS"] },
  { key: "system", label: "System", types: ["MODERATION", "SECURITY"] },
];

/** Symbol je Typ – Name eines lucide-Icons, damit Web und iOS dieselbe Semantik nutzen. */
export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  FOLLOW: "user-plus",
  COMMENT: "message-circle",
  REPLY: "corner-down-right",
  MENTION: "at-sign",
  LIKE: "heart",
  PROJECT_ACTIVITY: "layers",
  REMIX: "git-fork",
  NEW_POST_FROM_FOLLOWED: "pen-line",
  MESSAGE: "mail",
  ORDER_NEW: "shopping-bag",
  ORDER_STATUS: "package",
  MODERATION: "shield",
  COMMUNITY_INVITE: "users",
  TUTORIAL_UPDATED: "book-open",
  SECURITY: "key-round",
};

const nf = new Intl.NumberFormat("de-CH");

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function quote(title: string | null, max = 60) {
  if (!title) return null;
  const t = title.replace(/\s+/g, " ").trim();
  return `„${t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t}“`;
}

function isType(t: string): t is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(t);
}

/** „Anna“, „Anna und 1 weitere Person“, „Anna und 11 weitere“ (Nominativ) bzw. „… weiteren“ (Dativ). */
function actors(name: string | null, count: number, dative = false) {
  const n = name ?? "Jemand";
  const others = Math.max(0, count - 1);
  if (others === 0) return n;
  if (others === 1) return `${n} und ${dative ? "einer weiteren Person" : "eine weitere Person"}`;
  return `${n} und ${nf.format(others)} ${dative ? "weiteren" : "weitere"}`;
}

function targetNoun(targetType: string | null | undefined, data: Record<string, unknown>) {
  const explicit = str(data.targetLabel);
  if (explicit) return explicit;
  switch (targetType) {
    case "PROJECT":
      return "dein Projekt";
    case "TUTORIAL":
      return "deine Anleitung";
    case "ARTICLE":
      return "dein Artikel";
    case "PRODUCT":
      return "dein Produkt";
    case "COMMENT":
      return "dein Kommentar";
    case "COMMUNITY":
      return "deine Community";
    default:
      return "dein Beitrag";
  }
}

/** Akkusativ-Form („deinen Beitrag“) für Verben wie „kommentieren“. */
function accusative(noun: string) {
  return noun.replace(/^dein (Beitrag|Artikel|Kommentar)$/, "deinen $1");
}

export function notificationParts(n: NotificationLike): NotificationParts {
  const data = (n.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;
  const name = n.actor?.profile?.displayName ?? str(data.actorName);
  const count = Math.max(1, n.count);
  const plural = count > 1;
  const title = quote(str(data.title));
  const excerpt = str(data.excerpt);
  const noun = targetNoun(n.targetType, data);
  const t = isType(n.type) ? n.type : null;

  switch (t) {
    case "FOLLOW":
      return { lead: actors(name, count), text: plural ? "folgen dir jetzt." : "folgt dir jetzt.", excerpt: null };
    case "LIKE":
      return { lead: actors(name, count, true), text: `gefällt ${noun}${title ? ` ${title}` : ""}.`, excerpt: null };
    case "COMMENT":
      return {
        lead: actors(name, count),
        text: `${plural ? "haben" : "hat"} ${accusative(noun)}${title ? ` ${title}` : ""} kommentiert.`,
        excerpt,
      };
    case "REPLY":
      if (str(data.kind) === "review_reply") return { lead: name ?? "Der Shop", text: `hat auf deine Bewertung${title ? ` zu ${title}` : ""} geantwortet.`, excerpt };
      return { lead: name ?? "Jemand", text: `hat auf deinen Kommentar${title ? ` zu ${title}` : ""} geantwortet.`, excerpt };
    case "MENTION":
      return { lead: actors(name, count), text: `${plural ? "haben" : "hat"} dich${title ? ` in ${title}` : ""} erwähnt.`, excerpt };
    case "PROJECT_ACTIVITY": {
      const kind = str(data.kind) ?? (excerpt ? "COMMENT" : "LIKE");
      if (kind === "POLL_ENDED") return { lead: null, text: str(data.message) ?? "Deine Umfrage ist beendet.", excerpt: str(data.excerpt) };
      const p = title ? `dein Projekt ${title}` : "dein Projekt";
      if (kind === "COMMENT") return { lead: actors(name, count), text: `${plural ? "haben" : "hat"} ${p} kommentiert.`, excerpt };
      if (kind === "FOLLOW") return { lead: actors(name, count), text: `${plural ? "folgen" : "folgt"} ${p.replace(/^dein /, "deinem ")}.`, excerpt: null };
      if (kind === "SAVE") return { lead: actors(name, count), text: `${plural ? "haben" : "hat"} ${p} gemerkt.`, excerpt: null };
      if (kind === "UPDATE") return { lead: name, text: `${name ? "hat" : "Es gibt"} ein neues Journal-Update${title ? ` in ${title}` : ""}${name ? " veröffentlicht" : ""}.`, excerpt };
      return { lead: actors(name, count, true), text: `gefällt ${p}.`, excerpt: null };
    }
    case "REMIX":
      return {
        lead: actors(name, count),
        text: `${plural ? "haben" : "hat"} dein Projekt${title ? ` ${title}` : ""} nachgebaut.`,
        excerpt,
      };
    case "NEW_POST_FROM_FOLLOWED":
      return { lead: name ?? "Jemand, dem du folgst", text: title ? `hat ${title} geteilt.` : "hat etwas Neues geteilt.", excerpt };
    case "MESSAGE": {
      const group = quote(str(data.group));
      const kind = str(data.kind);
      if (kind === "group_invite") return { lead: name ?? "Jemand", text: group ? `hat dich zur Gruppe ${group} eingeladen.` : "hat dich zu einer Gruppe eingeladen.", excerpt };
      if (kind === "group_added") return { lead: name ?? "Jemand", text: group ? `hat dich zur Gruppe ${group} hinzugefügt.` : "hat dich zu einer Gruppe hinzugefügt.", excerpt };
      if (kind === "request") return { lead: name ?? "Jemand", text: "möchte dir schreiben – neue Kontaktanfrage.", excerpt };
      if (group) return plural ? { lead: null, text: `${nf.format(count)} neue Nachrichten in ${group}.`, excerpt } : { lead: name ?? "Jemand", text: `hat in ${group} geschrieben.`, excerpt };
      return plural
        ? { lead: name ?? "Jemand", text: `hat dir ${nf.format(count)} Nachrichten geschrieben.`, excerpt }
        : { lead: name ?? "Jemand", text: "hat dir eine Nachricht geschrieben.", excerpt };
    }
    case "ORDER_NEW": {
      const number = str(data.number);
      return {
        lead: null,
        text: plural ? `${nf.format(count)} neue Bestellungen in deinem Shop.` : `Neue Bestellung${number ? ` ${number}` : ""}${title ? ` – ${title}` : ""}.`,
        excerpt: null,
      };
    }
    case "ORDER_STATUS": {
      if (str(data.kind) === "review") return { lead: name ?? "Jemand", text: `hat${title ? ` ${title}` : " deinen Artikel"} bewertet${str(data.stars) ? ` (${str(data.stars)} von 5)` : ""}.`, excerpt };
      const number = str(data.number);
      const status = str(data.status) as OrderStatus | null;
      const label = status && status in ORDER_STATUS_LABEL ? ORDER_STATUS_LABEL[status] : str(data.statusLabel);
      return { lead: null, text: `Bestellung${number ? ` ${number}` : ""}: ${label ?? "Status aktualisiert"}.`, excerpt: str(data.note) };
    }
    case "MODERATION": {
      const caseNo = typeof data.caseNumber === "number" ? `Fall Nº ${data.caseNumber}` : "deinem Fall";
      const kind = str(data.kind);
      if (kind === "REPORT_RESOLVED") return { lead: null, text: `Danke für deine Meldung. ${caseNo} wurde geprüft und abgeschlossen.`, excerpt: null };
      if (kind === "APPEAL_DECIDED") {
        const outcome = data.outcome === "OVERTURNED" ? "Wir haben deinem Einspruch stattgegeben und die Massnahme aufgehoben." : "Dein Einspruch wurde geprüft. Die Entscheidung bleibt bestehen.";
        return { lead: null, text: `${caseNo}: ${outcome}`, excerpt: str(data.publicNote) };
      }
      if (kind === "MEDIA_FAILED") return { lead: null, text: str(data.message) ?? "Ein Video konnte nicht verarbeitet werden.", excerpt: null };
      if (kind === "SYSTEM_ERROR") return { lead: null, text: str(data.message) ?? "Ein neuer Fehler wurde erfasst.", excerpt: null };
      if (kind === "ACCOUNT") return { lead: null, text: str(data.message) ?? "Es gibt eine Änderung an deinem Konto.", excerpt: str(data.publicNote) };
      const action = str(data.action) as ModerationActionKind | null;
      const label = action && action in MODERATION_ACTION_LABEL ? MODERATION_ACTION_LABEL[action] : "Entscheidung";
      const reason = str(data.reasonLabel);
      return {
        lead: null,
        text: `Moderationsentscheidung zu ${caseNo}: ${label}${reason ? ` (${reason})` : ""}. Du kannst innerhalb von 14 Tagen Einspruch erheben.`,
        excerpt: str(data.publicNote),
      };
    }
    case "COMMUNITY_INVITE": {
      const kind = str(data.kind);
      if (kind === "approved") return { lead: null, text: `Deine Beitrittsanfrage${title ? ` für ${title}` : ""} wurde angenommen.`, excerpt: null };
      if (kind === "join_request") return { lead: actors(name, count), text: `${count > 1 ? "möchten" : "möchte"} der Community${title ? ` ${title}` : ""} beitreten.`, excerpt: null };
      if (kind === "event") return { lead: null, text: str(data.message) ?? "Neuigkeiten zu einem Event.", excerpt: null };
      if (kind === "event_going") return { lead: actors(name, count), text: `${count > 1 ? "sind" : "ist"} bei deinem Event${title ? ` ${title}` : ""} dabei.`, excerpt: null };
      if (kind === "dissolved") return { lead: null, text: `Die Community${title ? ` ${title}` : ""} wurde von der Gründerin bzw. dem Gründer aufgelöst.`, excerpt: null };
      return { lead: name ?? "Jemand", text: `lädt dich in die Community${title ? ` ${title}` : ""} ein.`, excerpt: null };
    }
    case "TUTORIAL_UPDATED":
      return {
        lead: null,
        text: `Die Anleitung${title ? ` ${title}` : ""} wurde aktualisiert${data.major ? " – mit wichtigen Änderungen" : ""}.`,
        excerpt: str(data.changeNote),
      };
    case "SECURITY": {
      const msg = str(data.message);
      if (msg) return { lead: null, text: msg, excerpt: null };
      const device = str(data.device);
      return { lead: null, text: device ? `Neue Anmeldung bei deinem Konto: ${device}.` : "Sicherheitsrelevante Änderung an deinem Konto.", excerpt: null };
    }
    default:
      return { lead: name, text: str(data.message) ?? "Neue Aktivität.", excerpt };
  }
}

/** Vollständiger Satz, z.B. „Anna und 11 weiteren gefällt dein Projekt „Wollmütze“.“ */
export function notificationText(n: NotificationLike): string {
  const p = notificationParts(n);
  return p.lead ? `${p.lead} ${p.text}` : p.text;
}

/** Ziel-URL für Klick auf eine Benachrichtigung. Nur relative Pfade (kein Open Redirect). */
export function notificationHref(n: Pick<NotificationLike, "type" | "data">): string {
  const data = (n.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;
  const href = str(data.href);
  if (href && href.startsWith("/") && !href.startsWith("//")) return href;
  switch (n.type) {
    case "MESSAGE":
      return "/nachrichten";
    case "ORDER_NEW":
      return "/studio/bestellungen";
    case "ORDER_STATUS":
      return "/bestellungen";
    case "SECURITY":
      return "/einstellungen/sicherheit";
    default:
      return "/benachrichtigungen";
  }
}

export function notificationGroup(type: string): NotificationGroup | null {
  for (const f of NOTIFICATION_FILTERS) if (f.types?.includes(type as NotificationType)) return f.key as NotificationGroup;
  return null;
}
