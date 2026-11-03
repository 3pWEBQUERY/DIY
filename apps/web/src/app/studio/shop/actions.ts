"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as shops from "@/server/commerce/shops";
import { shopSlugSchema } from "@werkraum/shared";

export async function saveShopAction(input: unknown, submit: boolean) {
  return act(async () => {
    const s = await shops.saveShop(await requireUser(), input, { submit });
    revalidatePath("/studio", "layout");
    return { status: s.status, slug: s.slug };
  }, submit ? "Antrag eingereicht." : "Gespeichert.");
}

export async function checkShopSlugAction(slug: string) {
  const parsed = shopSlugSchema.safeParse(slug);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültig" };
  const u = await requireUser().catch(() => null);
  const mine = u ? await shops.getMyShop(u.id) : null;
  const free = await shops.isShopSlugAvailable(parsed.data, mine?.id);
  return { ok: free, message: free ? "Verfügbar" : "Bereits vergeben" };
}

export async function startOnboardingAction() {
  return act(async () => ({ url: await shops.startStripeOnboarding(await requireUser()) }));
}

export async function stripeDashboardAction() {
  return act(async () => ({ url: await shops.stripeDashboardLink(await requireUser()) }));
}

export async function refreshStripeAction() {
  return act(async () => {
    const s = await shops.refreshStripeStatus(await requireUser());
    revalidatePath("/studio", "layout");
    return { status: s?.status ?? null };
  });
}

export async function simulateVerificationAction() {
  return act(async () => {
    await shops.simulateVerification(await requireUser());
    revalidatePath("/studio", "layout");
    return null;
  }, "Testmodus: Shop verifiziert und aktiv.");
}

export async function setShopPausedAction(paused: boolean) {
  return act(async () => {
    await shops.setShopPaused(await requireUser(), paused);
    revalidatePath("/studio/shop");
    return null;
  }, paused ? "Shop pausiert – deine Produkte sind vorübergehend nicht kaufbar." : "Shop wieder geöffnet.");
}
