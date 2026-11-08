"use server";

import { revalidatePath } from "next/cache";
import type { PlatformRole } from "@/server/db";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { adminResetMfa } from "@/server/auth/mfa";
import { changeRole, revokeUserSessions, suspendUser, unsuspendUser, verifyEmailManually } from "@/server/admin/users";

type ReasonInput = { reason: string; publicNote?: string; days?: number | null; choice?: string };

const refresh = (id: string) => {
  revalidatePath(`/admin/nutzer/${id}`);
  revalidatePath("/admin/nutzer");
};

export async function changeRoleAction(userId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    const r = await changeRole(u, userId, (input.choice ?? "") as PlatformRole, input.reason);
    refresh(userId);
    return r;
  }, "Rolle aktualisiert.");
}

export async function suspendUserAction(userId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await suspendUser(u, userId, { days: input.days ?? null, reason: input.reason, publicNote: input.publicNote ?? "" });
    refresh(userId);
    return null;
  }, "Konto gesperrt, Sitzungen beendet.");
}

export async function unsuspendUserAction(userId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await unsuspendUser(u, userId, input.reason);
    refresh(userId);
    return null;
  }, "Sperre aufgehoben.");
}

export async function verifyEmailAction(userId: string) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await verifyEmailManually(u, userId);
    refresh(userId);
    return null;
  }, "E-Mail-Adresse als bestätigt markiert.");
}

export async function revokeSessionsAction(userId: string) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const r = await revokeUserSessions(u, userId);
    refresh(userId);
    return r;
  }, "Alle Sitzungen wurden beendet.");
}

export async function resetMfaAction(userId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("SUPERADMIN");
    await adminResetMfa(u, userId, input.reason);
    refresh(userId);
    return null;
  }, "Zwei-Faktor-Anmeldung zurückgesetzt, Sitzungen beendet.");
}

/** Creator Pro schenken (Tage leer = unbefristet) bzw. geschenkten Zugang entziehen. */
export async function grantProAction(userId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    const { grantPro } = await import("@/server/pro/service");
    const r = await grantPro(u, userId, { days: input.days ?? 0, note: input.reason });
    refresh(userId);
    return r;
  }, "Creator Pro wurde geschenkt.");
}

export async function revokeProAction(userId: string) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    const { revokePro } = await import("@/server/pro/service");
    const r = await revokePro(u, userId);
    refresh(userId);
    return r;
  }, "Geschenkter Zugang entzogen.");
}
