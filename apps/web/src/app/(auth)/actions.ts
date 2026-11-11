"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { act, fail } from "@/server/errors";
import { completePinterestSignUp, decodePending, PINTEREST_PENDING_COOKIE } from "@/server/identity/pinterest";
import * as identity from "@/server/identity/service";
import { destroySession } from "@/server/auth/session";
import { verifyMfaLogin } from "@/server/auth/mfa";

import { safeNext } from "@/lib/safe-next";

export async function signUpAction(input: Record<string, unknown>) {
  return act(async () => {
    await identity.signUp(input);
    return { next: "/willkommen" };
  });
}

export async function signInAction(input: Record<string, unknown>) {
  return act(async () => {
    const r = await identity.signIn(input);
    const next = safeNext(input.weiter) ?? "/feed";
    // Zweiter Faktor aktiv → erst Code eingeben
    return { next: r.mfaRequired ? `/anmelden/zwei-faktor?weiter=${encodeURIComponent(next)}` : next };
  });
}

/** Registrierung mit Pinterest abschliessen (E-Mail-Adresse ergänzen – Pinterest liefert keine). */
export async function pinterestSignUpAction(input: Record<string, unknown>) {
  return act(async () => {
    const jar = await cookies();
    const pending = decodePending(jar.get(PINTEREST_PENDING_COOKIE)?.value);
    if (!pending) throw fail.invalid("Die Anmeldung mit Pinterest ist abgelaufen. Bitte starte sie erneut.");
    await completePinterestSignUp(pending, input);
    jar.delete(PINTEREST_PENDING_COOKIE);
    return { next: "/willkommen" };
  });
}

export async function checkHandleAction(handle: string) {
  return identity.isHandleAvailable(handle);
}

export async function requestResetAction(email: string) {
  return act(async () => {
    await identity.requestPasswordReset(email);
    return null;
  }, "Falls ein Konto existiert, haben wir dir eine E-Mail geschickt.");
}

export async function resetPasswordAction(tokenRaw: string, password: string) {
  return act(async () => {
    const r = await identity.resetPassword(tokenRaw, password);
    return { next: r.mfaRequired ? "/anmelden/zwei-faktor" : "/feed" };
  }, "Passwort geändert. Alle anderen Sitzungen wurden abgemeldet.");
}

/** Login, Schritt 2: Code aus der Authenticator-App oder Wiederherstellungscode. */
export async function verifyMfaAction(input: { code: string; kind: "totp" | "recovery"; weiter?: string }) {
  return act(async () => {
    await verifyMfaLogin(String(input.code ?? ""), input.kind === "recovery" ? "recovery" : "totp");
    return { next: safeNext(input.weiter) ?? "/feed" };
  });
}

/** Ausstehende Anmeldung verwerfen (anderes Konto / abbrechen). */
export async function cancelMfaAction() {
  await destroySession();
  redirect("/anmelden");
}

export async function signOutAction() {
  await destroySession();
  redirect("/");
}
