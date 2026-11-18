"use server";

import { act } from "@/server/errors";
import { confirmEmailChange } from "@/server/account/email-change";

/** Einlösen erst auf Klick (POST) – Link-Scanner in Mailprogrammen rufen nur GET auf und verbrauchen den Link sonst. */
export async function confirmEmailChangeAction(token: unknown) {
  return act(async () => ({ email: typeof token === "string" && token.length > 0 && token.length <= 200 ? await confirmEmailChange(token) : null }));
}
