"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { resetSetting, toggleFlag, updateSetting, upsertFlag } from "@/server/admin/system";

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
    revalidatePath("/admin/system");
    return null;
  }, enabled ? "Feature aktiviert." : "Feature deaktiviert.");
}

export async function upsertFlagAction(input: unknown) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await upsertFlag(u, input);
    revalidatePath("/admin/system");
    return null;
  }, "Feature-Flag gespeichert.");
}
