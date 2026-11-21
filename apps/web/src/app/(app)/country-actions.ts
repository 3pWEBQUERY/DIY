"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { confirmCountry } from "@/server/account/country";
import { GUEST_CURRENCY_COOKIE } from "@/server/commerce/currency";

/** Einmalige Abfrage des Landes (bestehende Mitglieder) */
export async function confirmCountryAction(input: { country: string }) {
  return act(async () => {
    const r = await confirmCountry((await requireUser({ allowSuspended: true })).id, input);
    // Alle Preise der Seite neu in der gewählten Währung
    revalidatePath("/", "layout");
    return r;
  });
}

/** Gäste: Währung der Preise wählen (ein Jahr gemerkt) */
export async function setGuestCurrencyAction(currency: "CHF" | "EUR") {
  if (currency !== "CHF" && currency !== "EUR") return;
  const { cookies } = await import("next/headers");
  (await cookies()).set(GUEST_CURRENCY_COOKIE, currency, { path: "/", maxAge: 365 * 86_400, sameSite: "lax", secure: process.env.NODE_ENV === "production", httpOnly: true });
}
