import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Currency } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getMyShop } from "@/server/commerce/shops";
import { bundleOptions, listMyBundles, listMyCoupons } from "@/server/commerce/promotions";
import { PageHeader } from "@/components/shell/page";
import { SectionTitle } from "@/components/ui/misc";
import { CouponManager } from "@/components/commerce/coupon-manager";
import { BundleManager } from "@/components/commerce/bundle-manager";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Gutscheine & Sets" };

/** Studio: Gutscheincodes und Sets (Bundles) des eigenen Shops. */
export default async function StudioDiscountsPage() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/studio/rabatte");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/studio/shop");
  const [{ coupons }, bundles, options] = await Promise.all([listMyCoupons(user), listMyBundles(user), bundleOptions(user)]);
  const currency = shop.currency as Currency;

  return (
    <div>
      <PageHeader kicker={`${BRAND.name} Studio · Marktplatz`} title="Gutscheine & Sets" description="Rabattcodes für Aktionen und Sets aus mehreren Produkten – zum Beispiel alles Material für eine Anleitung." />

      <section aria-labelledby="gutscheine" className="mb-14">
        <SectionTitle n="01" title={<span id="gutscheine">Gutscheine</span>} className="mb-4" />
        <CouponManager
          currency={currency}
          // Momentaufnahme für die Statusanzeige (Server und Client gleich → keine Hydration-Abweichung)
          now={Date.now()}
          coupons={coupons.map((c) => ({
            id: c.id,
            code: c.code,
            kind: c.kind,
            value: c.value,
            minSubtotalMinor: c.minSubtotalMinor,
            startsAt: c.startsAt?.toISOString() ?? null,
            endsAt: c.endsAt?.toISOString() ?? null,
            maxUses: c.maxUses,
            usedCount: c.usedCount,
            onePerBuyer: c.onePerBuyer,
            active: c.active,
            stats: c.stats,
          }))}
        />
      </section>

      <section aria-labelledby="sets">
        <SectionTitle n="02" title={<span id="sets">Sets</span>} className="mb-4" />
        <BundleManager
          currency={currency}
          products={options.products}
          tutorials={options.tutorials}
          bundles={bundles.map((b) => ({
            id: b.id,
            title: b.title,
            description: b.description,
            discountPct: b.discountPct,
            active: b.active,
            tutorial: b.tutorial,
            items: b.items,
            price: b.price,
            unavailable: b.unavailable,
          }))}
        />
      </section>
    </div>
  );
}
