"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { startConversationAction } from "@/app/(app)/nachrichten/actions";
import { MessageComposer } from "./composer";
import { callAction } from "@/lib/use-action";

/** Erste Nachricht an eine Person (optional mit Bestell- oder Produktkontext). */
export function NewConversationComposer({ handle, orderId, productId, name }: { handle: string; orderId?: string; productId?: string; name: string }) {
  const router = useRouter();
  return (
    <MessageComposer
      autoFocus
      placeholder={`Erste Nachricht an ${name} …`}
      onSend={async (body, media) => {
        const r = await callAction(() => startConversationAction({ recipientHandle: handle, orderId, productId, body, media }));
        if (!r.ok) {
          if (r.code === "UNAUTHENTICATED") router.push("/anmelden?weiter=/nachrichten");
          else toast(r.error, "error");
          return false;
        }
        if (r.data.asRequest) toast(`Als Kontaktanfrage an ${name} gesendet.`);
        router.replace(`/nachrichten/${r.data.conversationId}`);
        return true;
      }}
    />
  );
}
