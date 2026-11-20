"use server";

import { unsubscribeByToken } from "@/server/mail-unsubscribe";

export async function unsubscribeAction(token: string, list: "notifications" | "weekly" = "notifications") {
  return { ok: await unsubscribeByToken(token, list === "weekly" ? "weekly" : "notifications") };
}
