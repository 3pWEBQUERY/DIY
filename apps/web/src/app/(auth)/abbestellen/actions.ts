"use server";

import { unsubscribeByToken } from "@/server/mail-unsubscribe";

export async function unsubscribeAction(token: string) {
  return { ok: await unsubscribeByToken(token) };
}
