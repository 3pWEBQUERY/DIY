"use server";

import { act } from "@/server/errors";
import { verifyEmail } from "@/server/identity/service";

/** Einlösen erst auf Klick (POST) – Link-Scanner in Mailprogrammen rufen nur GET auf und verbrauchen den Link sonst. */
export async function verifyEmailAction(token: unknown) {
  return act(async () => ({ verified: typeof token === "string" && token.length > 0 && token.length <= 200 ? await verifyEmail(token) : false }));
}
