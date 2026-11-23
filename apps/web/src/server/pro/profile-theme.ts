import "server-only";
import { DEFAULT_PROFILE_THEME, PROFILE_ACCENTS, parseProfileTheme, profileThemeSchema, type ProfileTheme } from "@werkraum/shared";
import { db, Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { isPro } from "./service";

/**
 * Profil-Design (Creator Pro). Gespeichert wird es auch ohne aktives Pro nicht; endet Pro, bleibt es
 * gespeichert, wird aber nicht mehr angewendet (Profil sieht wieder wie alle aus) – kommt Pro zurück,
 * ist das Design wieder da.
 */
export async function effectiveProfileTheme(userId: string, pro?: boolean): Promise<ProfileTheme | null> {
  if (!(pro ?? (await isPro(userId)))) return null;
  const p = await db.userProfile.findUnique({ where: { userId }, select: { profileTheme: true } });
  return parseProfileTheme(p?.profileTheme);
}

/** Für den Editor: gespeichertes (oder Standard-)Design und ob gespeichert werden darf */
export async function profileThemeSettings(userId: string) {
  const [p, pro] = await Promise.all([db.userProfile.findUnique({ where: { userId }, select: { profileTheme: true } }), isPro(userId)]);
  const stored = parseProfileTheme(p?.profileTheme);
  return { theme: stored ?? DEFAULT_PROFILE_THEME, custom: !!stored, pro };
}

/** Speichern (null = zurück zum Standard) */
export async function saveProfileTheme(user: Pick<SessionUser, "id">, input: unknown) {
  if (input === null) {
    await db.userProfile.update({ where: { userId: user.id }, data: { profileTheme: Prisma.DbNull } });
    return { theme: DEFAULT_PROFILE_THEME, custom: false };
  }
  if (!(await isPro(user.id))) throw fail.forbidden("Das Profil-Design gehört zu Creator Pro.");
  const r = profileThemeSchema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw fail.invalid(issue?.message ?? "Ungültiges Design.", { [String(issue?.path[0] ?? "theme")]: issue?.message ?? "Ungültig" });
  }
  await db.userProfile.update({ where: { userId: user.id }, data: { profileTheme: r.data as unknown as Prisma.InputJsonValue } });
  return { theme: r.data, custom: true };
}

/** CSS-Variablen für den Profilbereich (überschreiben die Primärfarbe nur dort) */
export function themeStyle(theme: ProfileTheme | null): React.CSSProperties | undefined {
  if (!theme || theme.accent === "werkstatt") return undefined;
  const a = PROFILE_ACCENTS[theme.accent];
  return { "--color-moss": a.base, "--color-moss-ink": a.ink, "--color-moss-soft": a.soft } as React.CSSProperties;
}
