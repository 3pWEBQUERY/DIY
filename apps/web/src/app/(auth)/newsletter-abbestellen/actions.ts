"use server";

import { unsubscribeByToken } from "@/server/pro/newsletter";

export async function unsubscribeNewsletterAction(token: string) {
  return { ok: !!(await unsubscribeByToken(token)) };
}
