/**
 * Lesebestätigungen wie bei WhatsApp: ✓ gesendet, ✓✓ grau zugestellt, ✓✓ blau gelesen.
 * Ein Eintrag je Empfänger:in (Einzelchat: eine Person, Gruppe: alle Mitglieder ausser mir). Zählt nur,
 * wer beim Senden schon dabei war (Gruppenbeitritt danach sieht die Nachricht nicht).
 */
export type Receipt = { joinedAt: string; deliveredAt: string | null; readAt: string | null };
export type MessageStatus = "sent" | "delivered" | "read";

export function messageStatus(createdAt: string, receipts: Receipt[]): MessageStatus {
  const t = Date.parse(createdAt);
  const relevant = receipts.filter((r) => Date.parse(r.joinedAt) <= t);
  if (!relevant.length) return "sent";
  if (relevant.every((r) => r.readAt && Date.parse(r.readAt) >= t)) return "read";
  if (relevant.every((r) => r.deliveredAt && Date.parse(r.deliveredAt) >= t)) return "delivered";
  return "sent";
}

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = { sent: "Gesendet", delivered: "Zugestellt", read: "Gelesen" };
