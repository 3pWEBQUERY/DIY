"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { saveProfileTheme } from "@/server/pro/profile-theme";

export async function saveProfileThemeAction(input: unknown) {
  return act(async () => {
    const u = await requireUser();
    const r = await saveProfileTheme(u, input);
    revalidatePath("/studio/profil-design");
    if (u.profile?.handle) revalidatePath(`/u/${u.profile.handle}`);
    return r;
  }, input === null ? "Standard-Design wiederhergestellt." : "Profil-Design gespeichert.");
}
