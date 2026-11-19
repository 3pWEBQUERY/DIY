import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicCoupon } from "@/server/commerce/promotions";
import { Page } from "@/components/shell/page";
import { LinkButton } from "@/components/ui/button";
import { CopyCode } from "@/components/commerce/copy-code";
import { OG_BASE } from "@/config/seo";
import { BRAND } from "@/config/brand";

type Props = { params: Promise<{ id: string }> };

const day = (d: Date) => d.toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = await publicCoupon(id);
  if (!c) return { title: "Gutschein nicht gefunden", robots: { index: false } };
  const title = `${c.headline} bei ${c.shop.name}`;
  const description = c.valid ? `Gutscheincode ${c.code} – im Warenkorb auf ${BRAND.name} einlösen.` : "Dieser Gutschein ist nicht mehr gültig.";
  const image = c.valid ? [{ url: `/gutschein/${c.id}/bild`, width: 1080, height: 1080, alt: `Gutschein ${c.code}: ${title}` }] : OG_BASE.images;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { ...OG_BASE, title, description, images: image },
    twitter: { card: "summary_large_image", title, description, images: c.valid ? [`/gutschein/${c.id}/bild`] : undefined },
  };
}

/** Öffentliche Seite eines geteilten Gutscheins: Code, Bedingungen, Weg zum Shop. */
export default async function CouponPage({ params }: Props) {
  const { id } = await params;
  const c = await publicCoupon(id);
  if (!c) notFound();
  const terms = [c.minLabel, c.startsAt && c.startsAt > new Date() ? `gültig ab ${day(c.startsAt)}` : null, c.endsAt ? `gültig bis ${day(c.endsAt)}` : null, c.onePerBuyer ? "einmal pro Konto" : null, "nicht auf den Versand"].filter(Boolean);

  return (
    <Page width="narrow">
      <div className="py-6 md:py-10">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          Gutschein · <Link href={`/markt/${c.shop.slug}`} className="hover:text-ink">{c.shop.name}</Link>
        </p>
        <h1 className="display text-[2.4rem] leading-[1.05] sm:text-5xl">{c.headline}</h1>
        <p className="mt-3 text-[15px] text-ink-2">auf deinen Einkauf bei {c.shop.name}</p>

        {c.valid && c.code ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/gutschein/${c.id}/bild`} alt={`Gutschein ${c.code}: ${c.headline} bei ${c.shop.name}`} width={1080} height={1080} className="mt-8 aspect-square w-full rounded-2xl border border-line" />
            <div className="mt-6 rounded-2xl border border-rule bg-card p-5">
              <p className="spec mb-2">Dein Code</p>
              <CopyCode code={c.code} />
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                {terms.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <ol className="mt-6 space-y-2 text-[14px] leading-relaxed text-ink-2">
              <li>1. Im Shop „{c.shop.name}“ Artikel in den Warenkorb legen.</li>
              <li>2. Im Warenkorb auf „Gutscheincode für {c.shop.name}“ tippen und den Code eingeben.</li>
              <li>3. Der Rabatt wird sofort abgezogen.</li>
            </ol>
            <LinkButton href={`/markt/${c.shop.slug}`} size="lg" className="mt-6 w-full">
              Zum Shop „{c.shop.name}“
            </LinkButton>
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-line bg-sunken p-5 text-[14.5px]">
            <p className="font-semibold">{c.problem ?? "Dieser Gutschein ist nicht mehr gültig."}</p>
            <p className="mt-1 text-muted">Im Shop findest du trotzdem schöne Sachen.</p>
            <LinkButton href={`/markt/${c.shop.slug}`} variant="outline" className="mt-4">
              Zum Shop „{c.shop.name}“
            </LinkButton>
          </div>
        )}
      </div>
    </Page>
  );
}
