import "server-only";
import { z } from "zod";
import { CATEGORY_SLUGS, handleSchema } from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { attachMedia } from "@/server/media/service";
import { ownedImageByUrl, reserveHandleChange } from "@/server/account/service";
import { isHandleAvailable } from "./service";

const schema = z.object({
  displayName: z.string().trim().min(1).max(60),
  handle: handleSchema,
  adult: z.boolean().optional(),
  interests: z.array(z.enum(CATEGORY_SLUGS)).max(15).default([]),
  bio: z.string().trim().max(300).default(""),
  avatarUrl: z.string().max(500).nullable().optional(),
  region: z.string().trim().max(80).optional(),
});

/**
 * Speichert das Onboarding (§8.2). Jeder Schritt ist überspringbar – nur Name/Handle sind Pflicht.
 * Darf mehrfach aufgerufen werden (Zwischenspeichern, „Überspringen“ später im Ablauf); ein neuer
 * Benutzername zählt aber wie in den Profileinstellungen gegen das Limit (3 Wechsel in 30 Tagen), und
 * als Profilbild sind nur eigene, fertig verarbeitete Bilder erlaubt.
 */
export async function completeOnboarding(user: SessionUser, input: unknown) {
  const d = schema.parse(input);
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { adultConfirmedAt: true, onboardedAt: true, profile: { select: { handle: true, avatarUrl: true } } } });
  if (!full.adultConfirmedAt && !d.adult) throw fail.invalid("Bitte bestätige, dass du mindestens 18 Jahre alt bist.", { adult: "Erforderlich" });
  const handleChanged = !!full.profile && d.handle !== full.profile.handle;
  if (handleChanged) {
    const avail = await isHandleAvailable(d.handle, user.id);
    if (!avail.ok) throw fail.invalid(avail.reason, { handle: avail.reason });
  }
  // Profilbild: unverändert lassen, entfernen oder ein eigenes, fertiges Bild (keine fremden/entfernten Medien)
  const avatarChanged = d.avatarUrl !== undefined && d.avatarUrl !== (full.profile?.avatarUrl ?? null);
  const avatarMediaId = avatarChanged && d.avatarUrl ? await ownedImageByUrl(user.id, d.avatarUrl) : null;
  if (handleChanged) await reserveHandleChange(user.id);
  await db.$transaction(async (tx) => {
    if (avatarMediaId) await attachMedia(tx, user.id, [avatarMediaId]);
    if (full.profile && handleChanged) {
      // Eigener alter Handle darf zurückgeholt werden → Weiterleitung entfernen (wie updateProfile)
      await tx.handleRedirect.deleteMany({ where: { oldHandle: d.handle, userId: user.id } });
      await tx.handleRedirect.upsert({ where: { oldHandle: full.profile.handle }, create: { oldHandle: full.profile.handle, userId: user.id }, update: { userId: user.id } });
      await audit({ actorId: user.id, action: "account.handle_changed", targetType: "USER", targetId: user.id, meta: { from: full.profile.handle, to: d.handle, via: "onboarding" } }, tx);
    }
    await tx.userProfile.update({
      where: { userId: user.id },
      data: { displayName: d.displayName, handle: d.handle, bio: d.bio, categories: d.interests, region: d.region || null, ...(avatarChanged ? { avatarUrl: d.avatarUrl ?? null } : {}) },
    });
    await tx.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, interests: d.interests }, update: { interests: d.interests } });
    await tx.user.update({ where: { id: user.id }, data: { ...(full.onboardedAt ? {} : { onboardedAt: new Date() }), ...(full.adultConfirmedAt ? {} : { adultConfirmedAt: new Date() }) } });
  });
}

export async function skipOnboarding(user: SessionUser) {
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { adultConfirmedAt: true } });
  if (!full.adultConfirmedAt) throw fail.invalid("Bitte bestätige zuerst, dass du mindestens 18 Jahre alt bist.");
  await db.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
}
