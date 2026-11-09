"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, fail } from "@/server/errors";
import { destroySession, getSession, requireUser } from "@/server/auth/session";
import { deleteAccount } from "@/server/identity/service";
import { setBlock, setMute } from "@/server/social/interactions";
import * as account from "@/server/account/service";
import * as mfa from "@/server/auth/mfa";
import * as customer from "@/server/account/customer";

/** Server Actions der Einstellungen. Jede Aktion prüft die Sitzung serverseitig. */

export async function checkHandleAction(handle: string) {
  return act(async () => {
    const u = await requireUser();
    return account.checkHandle(handle, u.id);
  });
}

export async function updateProfileAction(input: unknown) {
  return act(async () => {
    const u = await requireUser();
    const r = await account.updateProfile(u, input);
    revalidatePath("/einstellungen/profil");
    revalidatePath(`/u/${r.handle}`);
    return r;
  }, "Profil gespeichert.");
}

export async function resendVerificationAction() {
  return act(async () => {
    const u = await requireUser({ allowSuspended: true });
    await account.resendVerification(u);
    return null;
  }, "Wir haben dir einen neuen Bestätigungslink geschickt.");
}

export async function requestEmailChangeAction(input: { email: string; password: string }) {
  return act(
    async () => {
      const u = await requireUser({ allowSuspended: true });
      const { requestEmailChange } = await import("@/server/account/email-change");
      return requestEmailChange(u.id, input);
    },
    (r) => `Fast geschafft: Wir haben einen Bestätigungslink an ${r.email} geschickt. Erst nach dem Klick wird die Adresse umgestellt.`,
  );
}

export async function changePasswordAction(input: { current: string; next: string; confirm: string }) {
  return act(async () => {
    const s = await getSession();
    if (!s) throw fail.auth();
    if (input.next !== input.confirm) throw fail.invalid("Die Passwörter stimmen nicht überein.", { confirm: "Stimmt nicht überein" });
    return account.changePasswordEverywhere(s.user, s.sessionId, input.current ?? "", input.next ?? "");
  }, "Passwort geändert. Andere Geräte wurden abgemeldet.");
}

export async function deleteAccountAction(input: { password: string; confirm: string }) {
  return act(async () => {
    const u = await requireUser({ allowSuspended: true });
    const s = (await getSession())!;
    if ((input.confirm ?? "").trim().toUpperCase() !== "LÖSCHEN") throw fail.invalid("Bitte tippe LÖSCHEN zur Bestätigung.", { confirm: "Bitte LÖSCHEN eintippen" });
    // Passwort bzw. ohne Passwort: frische Anmeldung mit Apple (siehe assertReauthenticated)
    await deleteAccount(u.id, s.sessionId, { password: input.password ?? null });
    await destroySession();
    redirect("/?konto=geloescht");
  });
}

export async function revokeSessionAction(key: string) {
  return act(async () => {
    const s = await getSession();
    if (!s) throw fail.auth();
    await account.revokeSession(s.user, key, s.sessionId);
    revalidatePath("/einstellungen/sicherheit");
    return null;
  }, "Sitzung beendet.");
}

export async function revokeOtherSessionsAction() {
  return act(async () => {
    const s = await getSession();
    if (!s) throw fail.auth();
    const r = await account.revokeOtherSessions(s.user, s.sessionId);
    revalidatePath("/einstellungen/sicherheit");
    return r;
  }, "Alle anderen Sitzungen wurden beendet.");
}

export async function signOutAction() {
  await destroySession();
  redirect("/");
}

export async function updateNotificationPrefsAction(input: unknown) {
  return act(async () => {
    const u = await requireUser({ allowSuspended: true });
    await account.updateNotificationSettings(u, input);
    revalidatePath("/einstellungen/benachrichtigungen");
    return null;
  }, "Benachrichtigungen gespeichert.");
}

export async function updateFeedPrefsAction(input: unknown) {
  return act(async () => {
    const u = await requireUser();
    await account.updateFeedSettings(u, input);
    revalidatePath("/einstellungen/feed");
    revalidatePath("/feed");
    return null;
  }, "Feed-Einstellungen gespeichert.");
}

export async function unmuteAction(userId: string) {
  return act(async () => {
    const u = await requireUser();
    await setMute(u, userId, false);
    revalidatePath("/einstellungen/feed");
    return null;
  }, "Stummschaltung aufgehoben.");
}

export async function resetHiddenAction() {
  return act(async () => {
    const u = await requireUser();
    const r = await account.resetHiddenContent(u);
    revalidatePath("/einstellungen/feed");
    return r;
  }, "Ausgeblendete Inhalte werden wieder angezeigt.");
}

export async function updatePrivacyAction(input: unknown) {
  return act(async () => {
    const u = await requireUser();
    await account.updatePrivacySettings(u, input);
    revalidatePath("/einstellungen/privatsphaere");
    return null;
  }, "Privatsphäre gespeichert.");
}

export async function unblockAction(userId: string) {
  return act(async () => {
    const u = await requireUser();
    await setBlock(u, userId, false);
    revalidatePath("/einstellungen/privatsphaere");
    return null;
  }, "Blockierung aufgehoben.");
}

export async function createTicketAction(input: unknown) {
  return act(async () => {
    const u = await requireUser({ allowSuspended: true });
    const r = await account.createSupportTicket(u, input);
    revalidatePath("/einstellungen/hilfe-support");
    return r;
  }, "Danke! Wir haben dir eine Bestätigung per E-Mail geschickt.");
}

/* ───────── Zwei-Faktor-Anmeldung ───────── */

async function mfaSession() {
  const s = await getSession();
  if (!s) throw fail.auth();
  return s;
}

/** Einrichtung starten – mit aktuellem Passwort (ohne Passwort: nach frischer Anmeldung mit Apple). */
export async function startMfaSetupAction(input: { password?: string } = {}) {
  return act(async () => {
    const s = await mfaSession();
    return mfa.startMfaSetup(s.user, s.sessionId, { password: input.password ?? null });
  });
}

export async function confirmMfaSetupAction(code: string) {
  return act(async () => {
    const s = await mfaSession();
    const r = await mfa.confirmMfaSetup(s.user, s.sessionId, code);
    revalidatePath("/einstellungen/sicherheit");
    return r;
  }, "Zwei-Faktor-Anmeldung aktiviert. Alle anderen Sitzungen wurden abgemeldet.");
}

export async function regenerateRecoveryCodesAction(code: string) {
  return act(async () => {
    const r = await mfa.regenerateRecoveryCodes((await mfaSession()).user, code);
    revalidatePath("/einstellungen/sicherheit");
    return r;
  }, "Neue Wiederherstellungscodes erstellt. Die alten sind ungültig.");
}

export async function disableMfaAction(code: string, password?: string) {
  return act(async () => {
    const s = await mfaSession();
    await mfa.disableMfa(s.user, s.sessionId, code, { password: password ?? null });
    revalidatePath("/einstellungen/sicherheit");
    return null;
  }, "Zwei-Faktor-Anmeldung deaktiviert.");
}

/** Ältere Sitzung nachträglich mit dem zweiten Faktor bestätigen (Voraussetzung für Admin/Moderation). */
export async function verifySessionMfaAction(input: { code: string; kind?: "totp" | "recovery" }) {
  return act(async () => {
    const s = await mfaSession();
    await mfa.verifySessionMfa(s.user, s.sessionId, String(input.code ?? ""), input.kind === "recovery" ? "recovery" : "totp");
    revalidatePath("/einstellungen/sicherheit");
    return null;
  }, "Sitzung bestätigt.");
}

/* ───────── Persönliche Angaben für Bestellungen ───────── */

export async function saveCustomerDetailsAction(input: unknown) {
  return act(async () => {
    const u = await requireUser();
    await customer.saveCustomerDetails(u.id, input);
    revalidatePath("/einstellungen/konto");
    return null;
  }, "Angaben gespeichert. Sie werden bei deinen nächsten Bestellungen verwendet.");
}

/* ───────────── Browser-Push ───────────── */

export async function webPushKeyAction() {
  return act(async () => {
    await requireUser({ allowSuspended: true });
    const { vapidPublicKey } = await import("@/server/push/web");
    return { publicKey: await vapidPublicKey() };
  });
}

export async function registerWebPushAction(subscription: unknown) {
  return act(async () => {
    const s = await getSession();
    if (!s) {
      const { fail } = await import("@/server/errors");
      throw fail.auth();
    }
    const { headers } = await import("next/headers");
    const { registerWebPush } = await import("@/server/push/web");
    return registerWebPush(s.user.id, s.sessionId, subscription, (await headers()).get("user-agent"));
  });
}

export async function unregisterWebPushAction(endpoint: string) {
  return act(async () => {
    const u = await requireUser({ allowSuspended: true });
    const { unregisterWebPush } = await import("@/server/push/web");
    return unregisterWebPush(u.id, endpoint);
  });
}
