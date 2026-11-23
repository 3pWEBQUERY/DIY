import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import { formatMoney } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { confirmGiftCardCheckout, myGiftCards } from "@/server/commerce/giftcards";
import { GiftCardClaim } from "@/components/commerce/giftcard-claim";
import { Badge, Empty, Notice, SectionTitle } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Geschenkgutscheine", robots: { index: false } };

type SP = Promise<{ gekauft?: string; session_id?: string; code?: string }>;

/** Erhaltene und verschenkte Geschenkgutscheine */
export default async function MyGiftCardsPage({ searchParams }: { searchParams: SP }) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  if (!user) redirect(`/anmelden?weiter=${encodeURIComponent(`/geschenkgutscheine${sp.code ? `?code=${sp.code}` : ""}`)}`);
  if (sp.gekauft) await confirmGiftCardCheckout(user.id, sp.gekauft, sp.session_id);
  const { received, bought } = await myGiftCards(user);
  const justBought = sp.gekauft ? bought.find((b) => b.id === sp.gekauft) : null;

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 md:py-10">
      <header className="mb-8 border-b border-rule pb-6">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          Marktplatz
        </p>
        <h1 className="display text-[2.4rem] sm:text-5xl">Geschenkgutscheine</h1>
      </header>

      {sp.gekauft && (
        <Notice tone="moss" className="mb-8" title={justBought ? "Danke – dein Gutschein ist gekauft" : "Zahlung wird bestätigt"}>
          {justBought
            ? justBought.delivered
              ? `${justBought.recipientName} hat den Gutschein per E-Mail erhalten.`
              : `${justBought.recipientName} erhält den Gutschein am ${formatDate(justBought.deliverAt, { day: "numeric", month: "long", year: "numeric" })} per E-Mail.`
            : "Das dauert meist nur einen Moment. Lade die Seite gleich neu."}
        </Notice>
      )}

      <section aria-labelledby="erhalten" className="mb-12">
        <SectionTitle n="01" title={<span id="erhalten">Erhalten</span>} />
        <div className="mb-6">
          <GiftCardClaim initialCode={sp.code ?? ""} />
        </div>
        {received.length === 0 ? (
          <Empty title="Noch keine Gutscheine" body="Gutscheine, die an deine E-Mail-Adresse gehen oder die du per Code hinzufügst, erscheinen hier." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {received.map((c) => (
              <li key={c.id} className="rounded-2xl border border-rule bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="spec">{c.shop.name}</p>
                    <p className="num mt-1 text-[1.7rem] font-semibold leading-none">{formatMoney(c.balanceMinor, c.currency)}</p>
                    <p className="mt-1 text-[12.5px] text-muted">
                      von {formatMoney(c.initialMinor, c.currency)} · {c.expired ? "abgelaufen" : `gültig bis ${formatDate(c.expiresAt, { day: "numeric", month: "short", year: "numeric" })}`}
                    </p>
                  </div>
                  <Gift size={20} className="text-moss" aria-hidden />
                </div>
                <p className="mt-3 font-mono text-[13px] tracking-[0.06em]">{c.code}</p>
                {c.senderName && <p className="mt-2 text-[13px] text-ink-2">Von {c.senderName}{c.message ? ` – „${c.message}“` : ""}</p>}
                {c.balanceMinor > 0 && !c.expired && (
                  <Link href={`/markt/${c.shop.slug}`} className="mt-3 inline-block text-[13px] font-semibold underline-offset-2 hover:underline">
                    Zum Shop
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="verschenkt">
        <SectionTitle n="02" title={<span id="verschenkt">Verschenkt</span>} />
        {bought.length === 0 ? (
          <Empty title="Noch nichts verschenkt" body="Viele Shops bieten Geschenkgutscheine an – du findest sie auf der Shopseite." />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {bought.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">
                    {formatMoney(c.initialMinor, c.currency)} für {c.recipientName} · {c.shop.name}
                  </p>
                  <p className="text-[13px] text-muted">
                    {c.status === "REFUNDED"
                      ? "Storniert und erstattet"
                      : c.delivered
                        ? `Zugestellt an ${c.recipientEmail} · Code ${c.code}`
                        : `Wird am ${formatDate(c.deliverAt, { day: "numeric", month: "long", year: "numeric" })} an ${c.recipientEmail} geschickt`}
                  </p>
                </div>
                <Badge tone={c.status === "REFUNDED" ? "neutral" : c.delivered ? "moss" : "outline"}>{c.status === "REFUNDED" ? "Erstattet" : c.delivered ? "Zugestellt" : "Geplant"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
