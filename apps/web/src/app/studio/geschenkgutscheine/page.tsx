import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatMoney } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getMyShop } from "@/server/commerce/shops";
import { giftCardStudio } from "@/server/commerce/giftcards";
import { PageHeader } from "@/components/shell/page";
import { SectionTitle } from "@/components/ui/misc";
import { GiftCardList, GiftCardSettingsForm } from "@/components/commerce/giftcard-settings";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Geschenkgutscheine" };

/** Studio: Geschenkgutscheine anbieten und verkaufte verwalten */
export default async function StudioGiftCardsPage() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/studio/geschenkgutscheine");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/studio/shop");
  const s = await giftCardStudio(user);
  const cur = s.shop.currency;

  return (
    <div>
      <PageHeader
        kicker={`${BRAND.name} Studio · Marktplatz`}
        title="Geschenkgutscheine"
        description="Kund:innen verschenken einen Betrag für deinen Shop. Das Geld kommt beim Kauf auf dein Konto (abzüglich Provision); beim Einlösen bezahlt die Kundschaft entsprechend weniger – ohne zweite Provision."
      />
      <dl className="mb-10 grid grid-cols-2 gap-6 border-y border-rule py-4 sm:grid-cols-4">
        <div>
          <dt className="spec">Verkauft</dt>
          <dd className="num mt-1 font-mono text-xl">{s.stats.sold}</dd>
        </div>
        <div>
          <dt className="spec">Umsatz Gutscheine</dt>
          <dd className="num mt-1 font-mono text-xl">{formatMoney(s.stats.soldMinor, cur)}</dd>
        </div>
        <div>
          <dt className="spec">Eingelöst</dt>
          <dd className="num mt-1 font-mono text-xl">{formatMoney(s.stats.redeemedMinor, cur)}</dd>
        </div>
        <div>
          <dt className="spec">Offenes Guthaben</dt>
          <dd className="num mt-1 font-mono text-xl">{formatMoney(s.stats.openMinor, cur)}</dd>
        </div>
      </dl>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="angebot">
          <SectionTitle n="01" title={<span id="angebot">Angebot</span>} className="mb-5" />
          <GiftCardSettingsForm settings={s.settings} currency={cur} />
        </section>
        <section aria-labelledby="verkauft">
          <SectionTitle n="02" title={<span id="verkauft">Verkaufte Gutscheine</span>} className="mb-5" />
          <GiftCardList cards={s.cards} />
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
            Gutscheinverkäufe erscheinen hier, nicht unter Einnahmen der Bestellungen – dort zählt beim Einlösen nur, was die Kundschaft zusätzlich bezahlt.
          </p>
        </section>
      </div>
    </div>
  );
}
