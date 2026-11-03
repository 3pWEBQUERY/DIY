"use server";

import { redirect } from "next/navigation";
import { act } from "@/server/errors";
import * as identity from "@/server/identity/service";
import { destroySession } from "@/server/auth/session";

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export async function signUpAction(input: Record<string, unknown>) {
  return act(async () => {
    await identity.signUp(input);
    return { next: "/willkommen" };
  });
}

export async function signInAction(input: Record<string, unknown>) {
  return act(async () => {
    await identity.signIn(input);
    return { next: safeNext(input.weiter) ?? "/feed" };
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
    await identity.resetPassword(tokenRaw, password);
    return null;
  }, "Passwort geändert. Alle anderen Sitzungen wurden abgemeldet.");
}

export async function signOutAction() {
  await destroySession();
  redirect("/");
}
