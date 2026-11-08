"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as pro from "@/server/pro/service";
import * as proProfile from "@/server/pro/profile";

/** Creator Pro: abschliessen, kündigen, Zahlungsmittel, Profilwerkzeuge. */

export async function startProCheckoutAction(interval: "month" | "year") {
  return act(async () => ({ url: await pro.startProCheckout(await requireUser(), interval) }));
}

export async function setProCancelAction(cancel: boolean) {
  return act(async () => {
    const r = await pro.setProCancel(await requireUser(), cancel);
    revalidatePath("/studio", "layout");
    return r;
  }, cancel ? "Gekündigt – Pro bleibt bis zum Ende der Laufzeit aktiv." : "Schön, dass du bleibst! Die Kündigung ist zurückgenommen.");
}

export async function proPaymentMethodAction() {
  return act(async () => ({ url: await pro.proPaymentMethodLink(await requireUser()) }));
}

export async function setFeaturedProjectsAction(ids: string[]) {
  return act(async () => {
    const u = await requireUser();
    const r = await proProfile.setFeaturedProjects(u, ids);
    revalidatePath(`/u/${u.profile?.handle}`);
    return r;
  }, "Hervorgehobene Projekte gespeichert.");
}

export async function setMediaKitPublicAction(value: boolean) {
  return act(async () => {
    const u = await requireUser();
    const r = await proProfile.setMediaKitPublic(u, value);
    revalidatePath(`/u/${u.profile?.handle}/medienkit`);
    return r;
  }, value ? "Medienkit ist jetzt öffentlich." : "Medienkit ist jetzt privat.");
}
