import "server-only";
import { z } from "zod";
import { CATEGORY_SLUGS, handleSchema } from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
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

/** Speichert das Onboarding (§8.2). Jeder Schritt ist überspringbar – nur Name/Handle sind Pflicht. */
export async function completeOnboarding(user: SessionUser, input: unknown) {
  const d = schema.parse(input);
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { adultConfirmedAt: true, profile: { select: { handle: true } } } });
  if (!full.adultConfirmedAt && !d.adult) throw fail.invalid("Bitte bestätige, dass du mindestens 18 Jahre alt bist.", { adult: "Erforderlich" });
  if (d.handle !== full.profile?.handle) {
    const avail = await isHandleAvailable(d.handle, user.id);
    if (!avail.ok) throw fail.invalid(avail.reason, { handle: avail.reason });
  }
  if (d.avatarUrl && !d.avatarUrl.startsWith("/media/")) throw fail.invalid("Ungültiges Profilbild.");
  await db.$transaction(async (tx) => {
    if (full.profile && d.handle !== full.profile.handle) {
      await tx.handleRedirect.upsert({ where: { oldHandle: full.profile.handle }, create: { oldHandle: full.profile.handle, userId: user.id }, update: { userId: user.id } });
    }
    await tx.userProfile.update({
      where: { userId: user.id },
      data: { displayName: d.displayName, handle: d.handle, bio: d.bio, categories: d.interests, region: d.region || null, ...(d.avatarUrl !== undefined ? { avatarUrl: d.avatarUrl } : {}) },
    });
    await tx.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, interests: d.interests }, update: { interests: d.interests } });
    await tx.user.update({ where: { id: user.id }, data: { onboardedAt: new Date(), ...(full.adultConfirmedAt ? {} : { adultConfirmedAt: new Date() }) } });
  });
}

export async function skipOnboarding(user: SessionUser) {
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { adultConfirmedAt: true } });
  if (!full.adultConfirmedAt) throw fail.invalid("Bitte bestätige zuerst, dass du mindestens 18 Jahre alt bist.");
  await db.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
}
