import "server-only";
import { isMemberCountry, MEMBER_COUNTRIES, type MemberCountry } from "@werkraum/shared";
import { z } from "zod";
import { db } from "@/server/db";

/**
 * Land der Mitglieder (bestimmt die Währung). Neue Konten wählen es bei der Registrierung;
 * bestehende werden einmal gefragt (`countryConfirmedAt` leer), vorausgefüllt aus der letzten Lieferadresse.
 */
export async function countryPromptFor(userId: string): Promise<{ suggested: MemberCountry | null } | null> {
  const profile = await db.userProfile.findUnique({ where: { userId }, select: { country: true, countryConfirmedAt: true } });
  if (!profile || profile.countryConfirmedAt) return null;
  const [details, order] = await Promise.all([
    db.customerDetails.findUnique({ where: { userId }, select: { country: true } }),
    db.order.findFirst({ where: { buyerId: userId, paidAt: { not: null } }, orderBy: { paidAt: "desc" }, select: { shippingAddress: true } }),
  ]);
  const fromOrder = (order?.shippingAddress as { country?: unknown } | null)?.country;
  const suggested = [details?.country, fromOrder, profile.country].find(isMemberCountry) ?? null;
  return { suggested };
}

const confirmSchema = z.object({ country: z.enum(MEMBER_COUNTRIES, { error: "Bitte wähle dein Land" }) });

export async function confirmCountry(userId: string, input: unknown) {
  const { country } = confirmSchema.parse(input);
  await db.userProfile.update({ where: { userId }, data: { country, countryConfirmedAt: new Date() } });
  return { country };
}
