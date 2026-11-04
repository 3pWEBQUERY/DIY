import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { CATEGORIES, PRODUCT_KIND_LABEL, categoryBySlug, COUNTRY_LABEL, type ShipCountry } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { listProducts, parseProductFilters } from "@/server/commerce/products";
import { listShops } from "@/server/commerce/shops";
import { paymentsMode } from "@/server/commerce/stripe";
import { ProductGrid } from "@/components/commerce/product-card";
import { ShopCard } from "@/components/commerce/shop-card";
import { MarketFilters, MARKET_SORT_LABEL } from "@/components/commerce/market-filters";
import { Empty, SectionTitle, Notice } from "@/components/ui/misc";
import { Glyph } from "@/components/ui/glyphs";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Marktplatz",
  description: "Handgemachtes, DIY-Materialsets und Anleitungen – direkt von Menschen aus der WERKRAUM-Community.",
  alternates: { canonical: "/markt" },
};

type SP = Record<string, string | string[] | undefined>;

function hrefWith(raw: Record<string, string>, patch: Record<string, string | null>) {
  const q = new URLSearchParams(raw);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `/markt?${s}` : "/markt";
}

/** UI-03 Marktplatz: ruhig, redaktionell, Community zuerst – keine gesponserten Platzierungen. */
export default async function MarketPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const filters = parseProductFilters(sp);
  const raw = Object.fromEntries(Object.entries(filters.raw).filter(([k]) => k !== "cursor"));
  const cursor = typeof sp.cursor === "string" ? sp.cursor : null;
  const filtered = Object.keys(raw).some((k) => k !== "sort");

  const [result, shops] = await Promise.all([
    listProducts(filters, cursor, { viewerId: user?.id, take: 24 }),
    !filtered && !cursor ? listShops({ take: 4, viewerId: user?.id }) : Promise.resolve([]),
  ]);
  const activeCat = categoryBySlug(filters.category);
  const mode = paymentsMode();

  const chips: { label: string; href: string }[] = [];
  if (filters.q) chips.push({ label: `„${filters.q}“`, href: hrefWith(raw, { q: null }) });
  if (activeCat) chips.push({ label: activeCat.name, href: hrefWith(raw, { kategorie: null }) });
  if (filters.kind) chips.push({ label: PRODUCT_KIND_LABEL[filters.kind], href: hrefWith(raw, { art: null }) });
  if (filters.uniqueOnly) chips.push({ label: "Nur Einzelstücke", href: hrefWith(raw, { unikat: null }) });
  if (raw.min || raw.max) chips.push({ label: `CHF ${raw.min ?? "0"}–${raw.max ?? "∞"}`, href: hrefWith(raw, { min: null, max: null }) });
  if (filters.shipsFrom) chips.push({ label: `Versand ab ${COUNTRY_LABEL[filters.shipsFrom as ShipCountry]}`, href: hrefWith(raw, { versand: null }) });

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 md:py-10 lg:px-10">
      {/* ───── Redaktioneller Kopf ───── */}
      <header className="grid gap-8 border-b border-rule pb-8 md:grid-cols-[1.2fr_1fr] md:items-end">
        <div>
          <p className="spec mb-3 flex items-center gap-2">
            <span className="inline-block h-px w-6 bg-rule-strong" />
            Marktplatz
          </p>
          <h1 className="display text-[2.6rem] text-balance sm:text-6xl">
            {activeCat ? activeCat.name : "Gemacht von Menschen, deren Werkbank du kennst."}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted text-pretty">
            Einzelstücke, Kleinserien, DIY-Materialsets und Anleitungen – direkt aus der Community. Viele Arbeiten zeigen ihr Projekt: Du siehst, wie sie entstanden sind.
          </p>
        </div>
        <Form action="/markt" role="search" className="md:justify-self-end md:w-full md:max-w-md">
          {Object.entries(raw)
            .filter(([k]) => k !== "q")
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <label htmlFor="markt-q" className="spec mb-2 block">
            Im Marktplatz suchen
          </label>
          <div className="flex items-stretch border border-rule bg-card focus-within:outline-2 focus-within:outline-moss rounded-2xl">
            <Search size={17} className="ml-3 self-center text-muted" aria-hidden />
            <input
              id="markt-q"
              name="q"
              type="search"
              defaultValue={filters.q ?? ""}
              placeholder="Korb, Wollset, Schneidebrett …"
              className="h-12 min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-muted/80"
            />
            <button type="submit" className="border-l border-rule px-4 text-[14px] font-semibold hover:bg-ink hover:text-paper">
              Suchen
            </button>
          </div>
        </Form>
      </header>

      {/* ───── Kategorien ───── */}
      <nav aria-label="Kategorien" className="-mx-4 overflow-x-auto border-b border-line px-4 scrollbar-none sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 py-3">
          <li>
            <Link href={hrefWith(raw, { kategorie: null })} aria-current={!activeCat ? "page" : undefined} className={cn("flex h-9 items-center rounded-full px-3.5 text-[13.5px]", !activeCat ? "bg-moss text-paper" : "text-ink-2 hover:bg-sunken")}>
              Alles
            </Link>
          </li>
          {CATEGORIES.map((c) => {
            const active = c.slug === filters.category;
            return (
              <li key={c.slug}>
                <Link
                  href={hrefWith(raw, { kategorie: c.slug })}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-9 items-center gap-2 rounded-full px-3.5 text-[13.5px]", active ? "bg-moss text-paper" : "text-ink-2 hover:bg-sunken")}
                >
                  <Glyph name={c.glyph} size={15} strokeWidth={1.6} />
                  {c.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {mode === "disabled" && (
        <Notice tone="warn" className="mt-6" title="Zahlungen noch nicht aktiviert">
          Du kannst bereits stöbern und Arbeiten merken. Bestellungen sind möglich, sobald die Zahlungsabwicklung freigeschaltet ist.
        </Notice>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[220px_1fr]">
        {/* ───── Filter ───── */}
        <aside aria-label="Filter">
          <details className="group border border-line bg-card p-4 lg:hidden rounded-2xl" open={filtered ? true : undefined}>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-semibold">
              <SlidersHorizontal size={15} /> Filter {chips.length > 0 && <span className="spec">({chips.length})</span>}
            </summary>
            <div className="mt-5">
              <MarketFilters raw={raw} idPrefix="fm" />
            </div>
          </details>
          <div className="sticky top-6 hidden lg:block">
            <MarketFilters raw={raw} idPrefix="fd" />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {chips.length ? (
                chips.map((c) => (
                  <Link key={c.label} href={c.href} className="inline-flex h-8 items-center gap-2 border border-line-strong bg-card px-2.5 text-[13px] hover:border-rule-strong rounded-xl" aria-label={`Filter ${c.label} entfernen`}>
                    {c.label} <span aria-hidden className="text-muted">×</span>
                  </Link>
                ))
              ) : (
                <p className="spec">Alle Arbeiten</p>
              )}
            </div>
            <p className="spec">
              {MARKET_SORT_LABEL[filters.sort ?? "neu"]} · keine gesponserten Platzierungen
            </p>
          </div>

          {result.items.length ? (
            <ProductGrid products={result.items} priorityFirst={4} className="md:grid-cols-3 xl:grid-cols-4" />
          ) : (
            <Empty
              title={filtered ? "Nichts Passendes gefunden" : "Der Marktplatz füllt sich gerade"}
              body={filtered ? "Versuch es mit weniger Filtern oder einem anderen Suchbegriff." : "Die ersten Shops richten gerade ihre Werkbank ein. Schau bald wieder vorbei – oder eröffne selbst einen Shop."}
              action={filtered ? <LinkButton href="/markt" variant="outline">Filter zurücksetzen</LinkButton> : <LinkButton href="/studio/shop" variant="outline">Shop eröffnen</LinkButton>}
            />
          )}

          {(result.nextCursor || cursor) && (
            <nav aria-label="Seiten" className="mt-12 flex items-center justify-between border-t border-line pt-5">
              {cursor ? (
                <Link href={hrefWith(raw, {})} className="text-[14px] text-muted hover:text-ink">
                  ← Zum Anfang
                </Link>
              ) : (
                <span />
              )}
              {result.nextCursor && (
                <Link href={`${hrefWith(raw, {})}${Object.keys(raw).length ? "&" : "?"}cursor=${result.nextCursor}`} className="inline-flex items-center gap-2 text-[14px] font-semibold hover:underline">
                  Weitere Arbeiten <ArrowRight size={15} />
                </Link>
              )}
            </nav>
          )}

          {shops.length > 0 && (
            <section className="mt-16" aria-labelledby="shops-title">
              <SectionTitle
                n="—"
                title={<span id="shops-title">Shops entdecken</span>}
                action={
                  <span className="spec hidden sm:inline">Sortiert nach Verkäufen &amp; Bewertungen</span>
                }
              />
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {shops.map((s) => (
                  <li key={s.id}>
                    <ShopCard shop={s} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <aside className="mt-16 grid gap-6 border-t border-rule pt-6 text-[13.5px] leading-relaxed text-ink-2 md:grid-cols-3">
            <div>
              <p className="spec mb-1.5">Transparent</p>
              <p>Du zahlst den angezeigten Preis plus Versand – keine Zusatzgebühren. Die Shops tragen eine Plattformprovision, die wir offen ausweisen.</p>
            </div>
            <div>
              <p className="spec mb-1.5">Sicher bezahlt</p>
              <p>Zahlungen laufen über Stripe. Shops sind verifiziert, bevor sie verkaufen dürfen. Bezahlt ist erst, was der Zahlungsanbieter bestätigt.</p>
            </div>
            <div>
              <p className="spec mb-1.5">Selbst verkaufen</p>
              <p>
                Du werkst selbst? <Link href="/studio/shop" className="font-semibold text-ink underline underline-offset-2">Eröffne deinen Shop</Link> im Creator Studio und verknüpfe Produkte mit deinen Projekten.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
