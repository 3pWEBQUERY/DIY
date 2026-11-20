"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart, Lock } from "lucide-react";
import { formatMoney } from "@werkraum/shared";
import { Button, LinkButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { callAction } from "@/lib/use-action";
import { startSupportAction } from "@/app/(app)/supporter-actions";
import { cn } from "@/lib/utils";

export type SupportCardOffer = {
  enabled: boolean;
  priceMinor: number;
  perks: string;
  exclusiveTutorials: number;
  creator: { id: string; handle: string; displayName: string } | null;
  me: { active: boolean; provider: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" });

/**
 * Unterstützer-Abo auf dem Profil bzw. bei einer exklusiven Anleitung: Preis, was man bekommt,
 * Knopf zum Unterstützen; wer schon unterstützt, sieht den Stand.
 */
export function SupportCard({ offer, signedIn, variant = "profile", returnTo, className }: { offer: SupportCardOffer; signedIn: boolean; variant?: "profile" | "locked"; returnTo: string; className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const name = offer.creator?.displayName ?? "diese Person";
  const active = offer.me?.active;

  const start = async () => {
    if (!offer.creator) return;
    setPending(true);
    const r = await callAction(() => startSupportAction(offer.creator!.id));
    if (r.ok) {
      if (/^https?:\/\//.test(r.data.url)) window.location.assign(r.data.url);
      else {
        router.push(r.data.url);
        router.refresh();
        setPending(false);
      }
      return;
    }
    setPending(false);
    toast(r.error, "error");
    if (r.code === "UNAUTHENTICATED") router.push(`/anmelden?weiter=${encodeURIComponent(returnTo)}`);
  };

  return (
    <section aria-labelledby="support-title" className={cn("rounded-2xl border border-rule bg-card p-5", className)}>
      <p className="spec flex items-center gap-1.5">
        {variant === "locked" ? <Lock size={12} aria-hidden /> : <Heart size={12} aria-hidden />}
        {variant === "locked" ? "Exklusiv für Unterstützer:innen" : "Unterstützer-Abo"}
      </p>
      <h2 id="support-title" className="mt-1.5 text-[17px] font-bold leading-snug">
        {active ? `Du unterstützt ${name}` : variant === "locked" ? `Unterstütze ${name}, um diese Anleitung zu öffnen` : `${name} unterstützen`}
      </h2>
      {active && offer.me ? (
        <>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
            Danke! Exklusive Anleitungen sind für dich freigeschaltet.
            {offer.me.currentPeriodEnd && (offer.me.cancelAtPeriodEnd || offer.me.provider === "apple") ? ` Läuft bis ${day(offer.me.currentPeriodEnd)}.` : ""}
          </p>
          <Link href="/einstellungen/unterstuetzungen" className="mt-3 inline-block text-[13px] font-semibold text-ink-2 underline-offset-2 hover:underline">
            Unterstützung verwalten
          </Link>
        </>
      ) : offer.enabled && offer.creator ? (
        <>
          <p className="mt-1 text-[14px]">
            <b className="num text-[20px]">{formatMoney(offer.priceMinor)}</b> <span className="text-muted">im Monat · jederzeit kündbar</span>
          </p>
          {offer.perks && <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{offer.perks}</p>}
          {offer.exclusiveTutorials > 0 && (
            <p className="mt-2 text-[13px] text-muted">
              {offer.exclusiveTutorials === 1 ? "1 exklusive Anleitung" : `${offer.exclusiveTutorials} exklusive Anleitungen`}
            </p>
          )}
          {signedIn ? (
            <Button className="mt-4 w-full" onClick={() => void start()} disabled={pending}>
              <Heart size={15} aria-hidden /> {pending ? "Einen Moment …" : `Unterstützen · ${formatMoney(offer.priceMinor)}/Monat`}
            </Button>
          ) : (
            <LinkButton href={`/anmelden?weiter=${encodeURIComponent(returnTo)}`} className="mt-4 w-full">
              Anmelden und unterstützen
            </LinkButton>
          )}
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">Der Betrag geht direkt an {name}; Werkuno behält einen kleinen Anteil für Zahlung und Betrieb.</p>
        </>
      ) : (
        <p className="mt-1.5 text-[13.5px] text-muted">{name} nimmt gerade keine neuen Unterstützungen an.</p>
      )}
    </section>
  );
}
