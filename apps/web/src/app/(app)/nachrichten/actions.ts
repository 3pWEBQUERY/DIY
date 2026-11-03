"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as msg from "@/server/messaging/service";

/** Server Actions für Nachrichten (§16). Mitgliedschaft wird in jeder Funktion serverseitig geprüft. */

export async function sendMessageAction(conversationId: string, input: unknown) {
  return act(async () => msg.sendMessage(await requireUser(), conversationId, input));
}

export async function startConversationAction(input: unknown) {
  return act(async () => {
    const r = await msg.startConversation(await requireUser(), input);
    revalidatePath("/nachrichten");
    return r;
  });
}

export async function markReadAction(conversationId: string) {
  return act(async () => msg.markRead(await requireUser(), conversationId));
}

export async function archiveConversationAction(conversationId: string, archived: boolean) {
  return act(async () => {
    const r = await msg.setArchived(await requireUser(), conversationId, archived);
    revalidatePath("/nachrichten");
    return r;
  }, archived ? "Unterhaltung archiviert." : "Zurück im Posteingang.");
}

export async function respondToRequestAction(conversationId: string, accept: boolean) {
  return act(async () => {
    const r = await msg.respondToRequest(await requireUser(), conversationId, accept);
    revalidatePath("/nachrichten");
    return r;
  }, accept ? "Anfrage angenommen." : "Anfrage abgelehnt.");
}

export async function loadOlderMessagesAction(conversationId: string, before: string) {
  return act(async () => {
    const t = await msg.getThread(await requireUser(), conversationId, { before });
    return { messages: t.messages, hasMore: t.hasMore };
  });
}
