import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { formatMoney, type Currency } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getMaterialPage } from "@/server/materials/service";
import { listOffers, OFFER_STALE_DAYS } from "@/server/materials/offers";
import { getProjectCards } from "@/server/projects/service";
import { Page } from "@/components/shell/page";
import { Notice, SectionTitle } from "@/components/ui/misc";
import { ProjectCard, ProjectGrid } from "@/components/projects/project-card";
import { StockToggle } from "@/components/materials/stock";
import { AddToShoppingList } from "@/components/materials/add-to-list";
import { BRAND } from "@/config/brand";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const m = await getMaterialPage(slug, null);
  if (!m) return { title: "Material nicht gefunden", robots: { index: false } };
  return {
    title: `${m.name} – Material`,
    description: (m.notes || `${m.name} (${m.type}) in der ${BRAND.name}-Materialdatenbank: Eigenschaften, Bezugsquellen und Projekte, die es verwenden.`).slice(0, 158),
    alternates: { canonical: `/materialien/${m.slug}` },
  };
}

function formatProp(v: unknown) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function MaterialPage({ params }: Params) {
  const { slug } = await params;
  const user = await currentUser();
  const m = await getMaterialPage(slug, user?.id);
  if (!m) notFound();
  const [offers, projects] = await Promise.all([listOffers(m.id, m.unit), getProjectCards(m.projectIds, user?.id).then((p) => p.slice(0, 8))]);
  const props = Object.entries(m.properties);
  const hasAffiliate = offers.some((o) => o.isAffiliate);
  const best = offers[0];

  return (
    <Page width="wide">
      <nav aria-label="Brotkrumen" className="spec mb-5 flex flex-wrap items-center gap-2">
        <Link href="/materialien" className="hover:text-ink">Materialien</Link>
        <span aria-hidden>/</span>
        <Link href={`/materialien?kategorie=${m.category.slug}`} className="hover:text-ink">{m.category.name}</Link>
      </nav>

      <header className="mb-10 grid gap-6 border-b border-rule pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <h1 className="display text-[2.4rem] text-balance sm:text-5xl">{m.name}</h1>
          <p className="mt-3 text-[14.5px] text-muted">
            <span className="text-ink-2">{m.type}</span>
            {m.brand && <> · {m.brand}</>}
            {" · "}Einheit <span className="font-mono text-[13px]">{m.unit}</span>
            {m.usedIn > 0 && <> · in {m.usedIn} {m.usedIn === 1 ? "Projekt" : "Projekten"} verwendet</>}
          </p>
          {m.notes && <p className="mt-4 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{m.notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StockToggle materialId={m.id} name={m.name} initialHave={!!m.stock} signedIn={!!user} />
          <AddToShoppingList kind="MATERIAL" id={m.id} title={m.name} count={1} signedIn={!!user} className="h-10 px-4" />
        </div>
      </header>

      <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-12">
          <section aria-labelledby="h-kaufen">
            <SectionTitle n="01" title={<span id="h-kaufen">Wo kaufen</span>} action={offers.length > 1 ? <span className="spec">günstigster Preis je Einheit zuerst</span> : undefined} />
            {offers.length ? (
              <>
                <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-card">
                  {offers.map((o) => (
                    <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_8.5rem_9rem_auto]">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                          {o.retailer}
                          {o === best && offers.length > 1 && <span className="rounded-full bg-moss-soft px-2 py-0.5 text-[11px] font-semibold text-moss-ink">Günstigster</span>}
                          {o.isAffiliate && <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-medium text-muted" title={`${BRAND.name} erhält bei einem Kauf eine Provision. Für dich ändert sich der Preis nicht.`}>Partnerlink</span>}
                        </p>
                        <p className="truncate text-[13px] text-muted">{[o.title, o.packLabel].filter(Boolean).join(" · ") || "–"}</p>
                      </div>
                      <p className="text-right sm:text-left">
                        <span className="block text-[15px] font-semibold num">{formatMoney(o.priceMinor, o.currency as Currency)}</span>
                        <span className={o.stale ? "whitespace-nowrap text-[11.5px] text-warn" : "whitespace-nowrap text-[11.5px] text-muted"}>Stand {new Date(o.checkedAt).toLocaleDateString("de-CH", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Zurich" })}</span>
                      </p>
                      <p className="col-start-1 text-[13px] text-ink-2 num sm:col-start-auto">{o.perUnit ? `${formatMoney(o.perUnit.minor, o.currency as Currency)} / ${o.perUnit.label}` : <span className="text-muted">–</span>}</p>
                      <a
                        href={o.href}
                        target="_blank"
                        rel={o.isAffiliate ? "sponsored nofollow noopener" : "nofollow noopener"}
                        className="col-start-2 row-start-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line-strong px-3 text-[13px] font-semibold hover:border-rule-strong sm:col-start-auto sm:row-start-auto"
                      >
                        Zum Shop <ArrowUpRight size={14} aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed text-muted">
                  Preise sind Momentaufnahmen der Redaktion und können sich geändert haben (älter als {OFFER_STALE_DAYS} Tage: orange markiert). Die Reihenfolge richtet sich nur nach dem Preis.
                  {hasAffiliate && ` Mit „Partnerlink“ markierte Links sind Werbung: Kaufst du darüber, erhält ${BRAND.name} eine kleine Provision – der Preis bleibt für dich gleich.`}
                </p>
              </>
            ) : (
              <p className="mt-4 text-[14px] text-muted">Für dieses Material sind noch keine Bezugsquellen hinterlegt. Tipp: Frag in der Community, wo andere es kaufen – oder schau im Marktplatz nach Materialsets.</p>
            )}
          </section>

          <section aria-labelledby="h-projekte">
            <SectionTitle n="02" title={<span id="h-projekte">Projekte mit {m.name}</span>} action={m.usedIn > projects.length && projects.length > 0 ? <Link href={`/projekte?q=${encodeURIComponent(m.name)}`} className="spec hover:text-ink">Alle ansehen</Link> : undefined} />
            {projects.length ? (
              <ProjectGrid className="mt-6">
                {projects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </ProjectGrid>
            ) : (
              <p className="mt-4 text-[14px] text-muted">Noch kein öffentliches Projekt verwendet dieses Material.</p>
            )}
          </section>
        </div>

        <aside className="space-y-10" aria-label="Materialdaten">
          {m.safetyInfo && (
            <Notice tone="warn" title="Sicherheitshinweis">
              <span className="flex gap-2 whitespace-pre-wrap">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
                {m.safetyInfo}
              </span>
            </Notice>
          )}
          <section>
            <SectionTitle title="Eigenschaften" />
            {props.length ? (
              <dl className="mt-3 divide-y divide-line text-[14px]">
                {props.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium">{formatProp(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-[13.5px] text-muted">Keine Eigenschaften hinterlegt.</p>
            )}
            {m.productRef && <p className="spec mt-3">Artikel-Nr. {m.productRef}</p>}
          </section>
          {user && (
            <section>
              <SectionTitle title="Dein Bestand" />
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                {m.stock ? (
                  <>
                    Im Bestand{m.stock.quantity ? <>: <span className="font-semibold text-ink">{m.stock.quantity}</span></> : ""}
                    {m.stock.note ? ` – ${m.stock.note}` : ""}.{" "}
                  </>
                ) : (
                  "Noch nicht in deinem Bestand. "
                )}
                <Link href="/materialien/bestand" className="font-semibold text-ink underline underline-offset-2">Bestand verwalten</Link>
              </p>
            </section>
          )}
          {m.related.length > 0 && (
            <section>
              <SectionTitle title={`Mehr aus ${m.category.name}`} />
              <ul className="mt-3 divide-y divide-line">
                {m.related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/materialien/${r.slug}`} className="flex items-baseline justify-between gap-3 py-2 text-[14px] hover:text-moss-ink">
                      <span className="font-medium">{r.name}</span>
                      <span className="spec truncate">{r.type}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </Page>
  );
}
