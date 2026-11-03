"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, fail } from "@/server/errors";
import { destroySession, getSession, requireUser } from "@/server/auth/session";
import { deleteAccount } from "@/server/identity/service";
import { setBlock, setMute } from "@/server/social/interactions";
import * as account from "@/server/account/service";

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
    if ((input.confirm ?? "").trim().toUpperCase() !== "LÖSCHEN") throw fail.invalid("Bitte tippe LÖSCHEN zur Bestätigung.", { confirm: "Bitte LÖSCHEN eintippen" });
    await deleteAccount(u.id, input.password ?? null);
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
  redirect("/anmelden");
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
