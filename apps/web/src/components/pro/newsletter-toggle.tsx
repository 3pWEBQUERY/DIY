"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { callAction } from "@/lib/use-action";
import { setNewsletterSubscriptionAction } from "@/app/studio/newsletter/actions";

/**
 * Profil einer Pro-Creatorin, für Follower:innen: Newsletter abonniert bzw. abbestellt.
 * Ruhig neben „Folgen“ – Folgen bleibt davon unberührt.
 */
export function NewsletterToggle({ creatorId, name, initial }: { creatorId: string; name: string; initial: { subscribed: boolean; globalOn: boolean } }) {
  const [on, setOn] = useState(initial.subscribed);
  const [pending, start] = useTransition();
  if (!initial.globalOn)
    return (
      <Link href="/einstellungen/benachrichtigungen" className="inline-flex h-10 items-center gap-2 px-2 text-[13px] text-muted hover:text-ink" title="Newsletter von Creator:innen sind in deinen Benachrichtigungen ausgeschaltet">
        <Mail size={15} aria-hidden /> Newsletter aus
      </Link>
    );
  return (
    <Button
      variant="outline"
      aria-pressed={on}
      disabled={pending}
      title={on ? `Du bekommst den Newsletter von ${name} per E-Mail` : `Newsletter von ${name} per E-Mail erhalten`}
      onClick={() =>
        start(async () => {
          const next = !on;
          setOn(next);
          const r = await callAction(() => setNewsletterSubscriptionAction(creatorId, next));
          if (!r.ok) {
            setOn(!next);
            return toast(r.error, "error");
          }
          toast(next ? `Du bekommst wieder den Newsletter von ${name}.` : `Newsletter von ${name} abbestellt. Du folgst weiterhin.`);
        })
      }
    >
      {on ? <MailCheck size={15} aria-hidden /> : <Mail size={15} aria-hidden />} {on ? "Newsletter abonniert" : "Newsletter abonnieren"}
    </Button>
  );
}
