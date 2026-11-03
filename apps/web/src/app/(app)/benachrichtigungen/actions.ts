"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { listNotifications, markNotificationsRead } from "@/server/notifications-inbox";

export async function markReadAction(ids: string[]) {
  return act(async () => {
    const u = await requireUser({ allowSuspended: true });
    return markNotificationsRead(u.id, ids);
  });
}

export async function markAllReadAction() {
  return act(async () => {
    const u = await requireUser({ allowSuspended: true });
    const r = await markNotificationsRead(u.id, "all");
    revalidatePath("/benachrichtigungen");
    return r;
  }, "Alles als gelesen markiert.");
}

export async function loadNotificationsAction(filter: string, cursor: string | null) {
  return act(async () => {
    const u = await requireUser({ allowSuspended: true });
    return listNotifications(u.id, { filter, cursor, limit: 40 });
  });
}
