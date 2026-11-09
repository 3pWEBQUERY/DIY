import "server-only";
import { notFound, redirect } from "next/navigation";
import type { PlatformRole } from "@/generated/prisma/client";
import { currentUser } from "@/server/auth/session";
import { hasRoleIgnoringMfa } from "@/server/authz";

/**
 * Seitenschutz für /admin (§7.3). Server Actions prüfen zusätzlich selbst per
 * `requireRole` – dieser Helfer schützt nur das Rendern.
 * Ohne Berechtigung antwortet der Bereich mit 404 (keine Bestätigung, dass es ihn gibt).
 */
export async function adminPage(min: PlatformRole = "PLATFORM_MODERATOR", path = "/admin") {
  const user = await currentUser();
  if (!user?.profile) redirect(`/anmelden?weiter=${encodeURIComponent(path)}`);
  if (!hasRoleIgnoringMfa(user, min)) notFound();
  if (user.status !== "ACTIVE") notFound();
  // Pflicht: Zwei-Faktor-Anmeldung für den Admin-Bereich
  if (!user.totpEnabledAt) redirect("/einstellungen/sicherheit?zweifaktor=pflicht");
  // … und in dieser Sitzung bestätigt (ältere Sitzungen geben den Code einmal nachträglich ein)
  if (!user.mfaVerified) redirect(`/einstellungen/sicherheit?zweifaktor=bestaetigen&weiter=${encodeURIComponent(path)}`);
  return user as typeof user & { profile: NonNullable<typeof user.profile> };
}

/** „an…@b…ch“ – E-Mail-Adressen in Listen nie im Klartext (§24.3 Datensparsamkeit). */
export function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const [host = "", ...rest] = domain.split(".");
  const tld = rest.join(".");
  const l = local.length <= 2 ? `${local[0] ?? ""}…` : `${local.slice(0, 2)}…`;
  const h = host ? `${host[0]}…` : "…";
  return `${l}@${h}${tld ? `.${tld}` : ""}`;
}

export const ROLE_LABEL: Record<PlatformRole, string> = {
  MEMBER: "Mitglied",
  PLATFORM_MODERATOR: "Moderation",
  ADMIN: "Administration",
  SUPERADMIN: "Superadmin",
};

export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktiv",
  SUSPENDED: "Gesperrt (zeitweise)",
  BANNED: "Dauerhaft gesperrt",
  DELETED: "Gelöscht",
};

export const CASE_STATUS_LABEL: Record<string, string> = {
  OPEN: "Offen",
  IN_REVIEW: "In Prüfung",
  RESOLVED: "Entschieden",
  APPEALED: "Einspruch",
  CLOSED: "Abgeschlossen",
};

export const TARGET_TYPE_LABEL: Record<string, string> = {
  POST: "Beitrag",
  COMMENT: "Kommentar",
  PROJECT: "Projekt",
  TUTORIAL: "Anleitung",
  TUTORIAL_STEP: "Anleitungsschritt",
  PRODUCT: "Produkt",
  USER: "Profil",
  MESSAGE: "Nachricht",
  ARTICLE: "Artikel",
  COMMUNITY: "Community",
  REVIEW: "Bewertung",
};

