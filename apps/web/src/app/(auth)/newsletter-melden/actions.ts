"use server";

import { act } from "@/server/errors";
import { reportNewsletter } from "@/server/pro/newsletter";

export async function reportNewsletterAction(token: string, input: { reason: string; details?: string }) {
  return act(async () => reportNewsletter(token, input));
}
