import "server-only";
import { z } from "zod";
import { db, Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { attachMedia } from "@/server/media/service";
import { isPro, PRO_NAME } from "@/server/pro/service";

/**
 * Eigenes Branding für die Druck-/PDF-Fassung der eigenen Anleitungen (Creator Pro):
 * Logo, Name und Link (Shop oder Website) statt des Werkuno-Kopfs. Ein kleiner Hinweis
 * „erstellt mit Werkuno“ bleibt.
 */
export type PdfBrand = { name: string; link: string | null; logoUrl: string | null; logoMediaId: string | null };

const httpsUrl = z
  .string()
  .trim()
  .max(200)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !!u.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Bitte gib eine vollständige Adresse mit https:// an");

export const pdfBrandSchema = z.object({
  name: z.string().trim().min(1, "Bitte gib einen Namen an").max(60, "Höchstens 60 Zeichen"),
  link: z.union([httpsUrl, z.literal("")]).default(""),
  logoMediaId: z.string().max(64).optional(),
  removeLogo: z.boolean().optional(),
});

export function parsePdfBrand(value: unknown): PdfBrand | null {
  const v = value as Partial<PdfBrand> | null;
  if (!v || typeof v !== "object" || typeof v.name !== "string" || !v.name.trim()) return null;
  return {
    name: v.name,
    link: typeof v.link === "string" && v.link ? v.link : null,
    logoUrl: typeof v.logoUrl === "string" && v.logoUrl ? v.logoUrl : null,
    logoMediaId: typeof v.logoMediaId === "string" ? v.logoMediaId : null,
  };
}

/** Gespeichertes Branding (auch ohne aktives Pro – zum Bearbeiten) */
export async function getPdfBrand(userId: string) {
  const p = await db.userProfile.findUnique({ where: { userId }, select: { pdfBrand: true } });
  return parsePdfBrand(p?.pdfBrand);
}

/** Branding für die Druckfassung: nur, wenn die Autor:in Pro ist und etwas gespeichert hat */
export async function pdfBrandFor(authorId: string) {
  const [brand, pro] = await Promise.all([getPdfBrand(authorId), isPro(authorId)]);
  return pro ? brand : null;
}

async function logoUrlOf(userId: string, mediaId: string) {
  const m = await db.media.findUnique({ where: { id: mediaId }, select: { ownerId: true, kind: true, state: true, variants: true } });
  if (!m || m.ownerId !== userId) throw fail.forbidden("Ungültiges Bild.");
  if (m.kind !== "IMAGE") throw fail.invalid("Bitte wähle ein Bild.", { logo: "Nur Bilder" });
  if (m.state !== "READY") throw fail.invalid("Das Bild wird noch verarbeitet. Bitte versuche es gleich noch einmal.", { logo: "Wird verarbeitet" });
  const v = (m.variants ?? {}) as Record<string, string>;
  const url = v.md ?? v.sm ?? v.lg;
  if (!url) throw fail.invalid("Für dieses Bild fehlen Vorschaugrössen.");
  return url;
}

export async function savePdfBrand(user: { id: string }, input: unknown) {
  if (!(await isPro(user.id))) throw fail.forbidden(`Eigenes PDF-Branding ist Teil von ${PRO_NAME}.`);
  const d = pdfBrandSchema.parse(input);
  const current = await getPdfBrand(user.id);
  let logoUrl = d.removeLogo ? null : (current?.logoUrl ?? null);
  let logoMediaId = d.removeLogo ? null : (current?.logoMediaId ?? null);
  if (d.logoMediaId && d.logoMediaId !== current?.logoMediaId) {
    logoUrl = await logoUrlOf(user.id, d.logoMediaId);
    logoMediaId = d.logoMediaId;
  }
  const brand: PdfBrand = { name: d.name, link: d.link || null, logoUrl, logoMediaId };
  await db.$transaction(async (tx) => {
    if (logoMediaId) await attachMedia(tx, user.id, [logoMediaId]);
    await tx.userProfile.update({ where: { userId: user.id }, data: { pdfBrand: brand as unknown as Prisma.InputJsonValue } });
  });
  return brand;
}

export async function clearPdfBrand(user: { id: string }) {
  await db.userProfile.update({ where: { userId: user.id }, data: { pdfBrand: Prisma.DbNull } });
  return { cleared: true };
}
