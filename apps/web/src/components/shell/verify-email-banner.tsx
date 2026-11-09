"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { resendVerificationAction } from "@/app/(app)/einstellungen/actions";

const KEY = "wr_verify_hidden";

/** Hinweis für unbestätigte E-Mail-Adressen – mit „Link erneut senden“, pro Sitzung ausblendbar. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [hidden, setHidden] = useState(true);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
  };
  return (
    <div role="status" className="flex items-center gap-3 border-b border-line bg-warn-soft px-4 py-2.5 text-[13.5px] text-ink sm:px-6 print:hidden">
      <Mail size={16} className="shrink-0 text-warn" aria-hidden />
      <p className="min-w-0 flex-1">
        {sent ? (
          <>Wir haben dir einen neuen Link an <strong>{email}</strong> geschickt. Schau auch im Spam-Ordner nach.</>
        ) : (
          <>Bitte bestätige deine E-Mail-Adresse <strong className="break-all">{email}</strong> – damit du Benachrichtigungen erhältst und dein Konto wiederherstellen kannst.</>
        )}
      </p>
      {!sent && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await resendVerificationAction();
              if (r.ok) setSent(true);
              else toast(r.error, "error");
            })
          }
          className="shrink-0 rounded-lg px-2.5 py-1 font-semibold text-moss hover:bg-paper disabled:opacity-50"
        >
          {pending ? "Wird gesendet …" : "Link erneut senden"}
        </button>
      )}
      <button type="button" onClick={hide} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink" aria-label="Hinweis ausblenden">
        <X size={14} />
      </button>
    </div>
  );
}
