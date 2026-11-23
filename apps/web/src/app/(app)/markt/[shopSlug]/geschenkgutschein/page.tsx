import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { giftCardOffer } from "@/server/commerce/giftcards";
import { paymentsMode } from "@/server/commerce/stripe";
import { GiftCardBuyForm } from "@/components/commerce/giftcard-buy-form";
import { LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";

type Params = { params: Promise<{ shopSlug: string }>; searchParams: Promise<{ abgebrochen?: string }> };

export const metadata: Metadata = { title: "Geschenkgutschein", robots: { index: false } };

/** Geschenkgutschein eines Shops kaufen */
export default async function GiftCardBuyPage({ params, searchParams }: Params) {
  const [{ shopSlug }, sp, user] = await Promise.all([params, searchParams, currentUser()]);
  const offer = await giftCardOffer(shopSlug, user?.id);
  if (!offer) notFound();
  const mode = paymentsMode();

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6 md:py-10">
      <nav aria-label="Brotkrumen" className="spec mb-6">
        <Link href="/markt" className="hover:text-ink">
          Marktplatz
        </Link>{" "}
        /{" "}
        <Link href={`/markt/${offer.shop.slug}`} className="hover:text-ink">
          {offer.shop.name}
        </Link>{" "}
        / <span className="text-ink">Geschenkgutschein</span>
      </nav>
      <header className="mb-8 border-b border-rule pb-6">
        <h1 className="display text-[2.2rem] sm:text-5xl">Geschenkgutschein für {offer.shop.name}</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
          Die beschenkte Person erhält den Gutschein per E-Mail – sofort oder an einem Tag deiner Wahl – und löst ihn im Warenkorb ein.
          {offer.note ? ` ${offer.note}` : ""}
        </p>
      </header>
      {sp.abgebrochen && (
        <Notice className="mb-6" title="Zahlung abgebrochen">
          Es wurde nichts belastet. Du kannst es gleich nochmals versuchen.
        </Notice>
      )}
      {offer.isOwner ? (
        <Notice title="Dein eigener Shop">So sehen Käufer:innen dein Angebot. Gutscheine für den eigenen Shop kannst du nicht kaufen.</Notice>
      ) : !user ? (
        <div className="rounded-2xl border border-rule bg-card p-6">
          <p className="text-[15px]">Melde dich an, um einen Gutschein zu verschenken.</p>
          <LinkButton href={`/anmelden?weiter=${encodeURIComponent(`/markt/${offer.shop.slug}/geschenkgutschein`)}`} className="mt-4">
            Anmelden
          </LinkButton>
        </div>
      ) : !offer.payable || mode === "disabled" ? (
        <Notice tone="warn" title="Gerade nicht möglich">Der Shop kann im Moment keine Zahlungen annehmen.</Notice>
      ) : (
        <GiftCardBuyForm offer={offer} senderName={user.profile?.displayName ?? ""} mode={mode === "stripe" ? "stripe" : "simulated"} />
      )}
    </div>
  );
}
