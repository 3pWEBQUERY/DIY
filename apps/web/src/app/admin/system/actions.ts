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
