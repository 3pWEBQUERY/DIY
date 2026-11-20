import Link from "next/link";
import { hashtagHref } from "@werkraum/shared";
import { HASHTAG_KINDS, HASHTAG_KIND_LABEL, HASHTAG_KIND_SLUG, type HashtagKind, type HashtagPage } from "@/server/hashtags/service";
import { TabLinks } from "@/components/shell/page";
import { Empty, SectionTitle } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { HashtagItems, HashtagList, type HashtagViewer } from "./hashtag-items";

const num = (n: number) => new Intl.NumberFormat("de-CH").format(n);
const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;
const SINGULAR: Record<HashtagKind, string> = { post: "Beitrag", project: "Projekt", tutorial: "Anleitung", article: "Artikel", product: "Produkt", comment: "Kommentar" };

/**
 * Hashtag-Ansicht (Seite und Fenster über der aktuellen Seite): Kopf, Arten als Reiter,
 * Übersicht mit wenigen Treffern je Art oder die vollständige Liste einer Art, ähnliche Hashtags.
 * `overlay`: Reiter ersetzen den Verlaufseintrag, damit „Zurück“ das Fenster schliesst.
 */
export function HashtagView({ page, viewer, overlay = false }: { page: HashtagPage; viewer: HashtagViewer; overlay?: boolean }) {
  const base = hashtagHref(page.tag.name);
  const href = (k: HashtagKind | null) => (k ? `${base}?typ=${HASHTAG_KIND_SLUG[k]}` : base);
  const kinds = HASHTAG_KINDS.filter((k) => page.counts[k] > 0);
  const summary = kinds.map((k) => plural(page.counts[k], SINGULAR[k], HASHTAG_KIND_LABEL[k])).join(" · ");

  return (
    <div>
      <header className="pb-6">
        <p className="spec">Hashtag</p>
        <h1 className="display mt-1 break-words text-[2.5rem] leading-none tracking-tight sm:text-[3.5rem]">
          <span className="text-moss">#</span>
          {page.tag.display}
        </h1>
        <p className="mt-3 text-[15px] text-muted">{page.total > 0 ? summary : "Noch nicht verwendet"}</p>
      </header>

      {page.total > 0 && (
        <TabLinks
          label="Arten"
          replace={overlay}
          active={page.kind ? HASHTAG_KIND_SLUG[page.kind] : "alle"}
          tabs={[
            { key: "alle", href: href(null), label: "Alle", count: page.total },
            ...kinds.map((k) => ({ key: HASHTAG_KIND_SLUG[k], href: href(k), label: HASHTAG_KIND_LABEL[k], count: page.counts[k] })),
          ]}
        />
      )}

      <div className="mt-8">
        {page.total === 0 ? (
          <Empty
            title={`Noch keine Inhalte mit #${page.tag.display}`}
            body={`Sobald jemand #${page.tag.display} in einem Beitrag, Projekt, einer Anleitung oder einem Kommentar verwendet, erscheint es hier.`}
            action={
              <Link href="/feed" className={buttonClass("outline", "sm")}>
                Zum Feed
              </Link>
            }
          />
        ) : page.kind ? (
          <HashtagList key={page.kind} tag={page.tag.name} kind={page.kind} slug={HASHTAG_KIND_SLUG[page.kind]} initial={itemsOf(page, page.kind)} cursor={page.nextCursor} viewer={viewer} />
        ) : (
          <div className="space-y-14">
            {kinds.map((k, i) => (
              <section key={k} aria-labelledby={`ht-${k}`}>
                <SectionTitle
                  n={String(i + 1).padStart(2, "0")}
                  title={<span id={`ht-${k}`}>{HASHTAG_KIND_LABEL[k]}</span>}
                  action={
                    page.counts[k] > itemsOf(page, k).length ? (
                      <Link href={href(k)} replace={overlay} scroll={false} className="text-[13px] font-semibold text-moss hover:underline">
                        Alle {num(page.counts[k])} anzeigen
                      </Link>
                    ) : undefined
                  }
                />
                <div className="mt-5">
                  <HashtagItems kind={k} items={itemsOf(page, k)} viewer={viewer} />
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {page.related.length > 0 && (
        <section aria-labelledby="ht-related" className="mt-14 border-t border-rule pt-5">
          <h2 id="ht-related" className="spec">
            Ähnliche Hashtags
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {page.related.map((r) => (
              <li key={r.name}>
                <Link
                  href={hashtagHref(r.name)}
                  scroll={false}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line px-3 text-[13.5px] text-ink-2 hover:border-rule-strong hover:text-ink"
                >
                  #{r.display}
                  <span className="font-mono text-[11px] text-muted">{num(r.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function itemsOf(page: HashtagPage, k: HashtagKind): { id: string }[] {
  switch (k) {
    case "post":
      return page.posts;
    case "project":
      return page.projects;
    case "tutorial":
      return page.tutorials;
    case "article":
      return page.articles;
    case "product":
      return page.products;
    case "comment":
      return page.comments;
  }
}
