"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { resetSetting, setFlagRollout, toggleFlag, updateSetting } from "@/server/admin/system";

export async function updateSettingAction(key: string, value: unknown) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await updateSetting(u, key, value);
    revalidatePath("/admin/system");
    return null;
  }, "Einstellung gespeichert.");
}

export async function resetSettingAction(key: string) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await resetSetting(u, key);
    revalidatePath("/admin/system");
    return null;
  }, "Auf Standard zurückgesetzt.");
}

export async function toggleFlagAction(key: string, enabled: boolean) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await toggleFlag(u, key, enabled);
    // Navigation und Seiten aller Bereiche neu rendern
    revalidatePath("/", "layout");
    return null;
  }, enabled ? "Feature aktiviert." : "Feature deaktiviert.");
}

export async function setFlagRolloutAction(key: string, rollout: number) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await setFlagRollout(u, key, rollout);
    revalidatePath("/", "layout");
    return null;
  }, "Rollout gespeichert.");
}

/** Test-E-Mail an die eigene Adresse – zeigt sofort, ob der Versand über Resend klappt. */
export async function sendTestMailAction() {
  return act(async () => {
    const u = await requireRole("ADMIN");
    const { sendMail } = await import("@/server/mail");
    const { audit } = await import("@/server/audit");
    const r = await sendMail(u.email, "Test-E-Mail von Werkuno", `Hallo!\n\nDiese Test-E-Mail bestätigt, dass der Versand über Resend funktioniert.\n\nGesendet am ${new Date().toLocaleString("de-CH", { timeZone: "Europe/Zurich" })}.`);
    await audit({ actorId: u.id, action: "admin.mail_test", meta: { delivered: r.delivered } });
    if (!r.delivered) {
      const { fail } = await import("@/server/errors");
      throw fail.unavailable("reason" in r && r.reason ? `Versand fehlgeschlagen – ${r.reason}` : "Versand nicht möglich: RESEND_API_KEY fehlt.");
    }
    return { to: u.email };
  });
}
