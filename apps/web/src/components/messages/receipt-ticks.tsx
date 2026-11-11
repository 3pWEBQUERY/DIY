import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { MESSAGE_STATUS_LABEL, type MessageStatus } from "@/lib/message-status";

/** ✓ gesendet · ✓✓ grau zugestellt · ✓✓ blau gelesen (wie WhatsApp). */
export function ReceiptTicks({ status, onBubble = false, className }: { status: MessageStatus; onBubble?: boolean; className?: string }) {
  const Icon = status === "sent" ? Check : CheckCheck;
  const tone = status === "read" ? (onBubble ? "text-receipt" : "text-receipt-ink") : onBubble ? "text-paper/70" : "text-muted";
  return (
    <span className={cn("inline-flex shrink-0", tone, className)} title={MESSAGE_STATUS_LABEL[status]}>
      <Icon size={15} strokeWidth={2.25} aria-hidden />
      <span className="sr-only">{MESSAGE_STATUS_LABEL[status]}</span>
    </span>
  );
}
