import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, PenLine, Search } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { getBlogIndex, listArticleCategories, listArticles } from "@/server/blog/service";
import { Page } from "@/components/shell/page";
import { ArticleCard } from "@/components/blog/article-card";
import { Avatar, Empty, SectionTitle } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { cn, formatDate, pluralize } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Blogs",
  description: "Werkstattberichte, Materialkunde und Geschichten von Menschen, die mit den Händen erschaffen.",
  alternates: { canonical: "/blogs" },
  openGraph: { title: "Blogs aus den Werkstätten", type: "website" },
};

type SP = { q?: string; rubrik?: string; tag?: string; nach?: string };

function CategoryNav({ categories, active }: { categories: { slug: string; name: string }[]; active?: string }) {
  return (
    <nav aria-label="Rubriken" className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-5 border-y border-ink py-2.5 text-[13px]">
        <li>
          <Link href="/blogs" aria-current={!active ? "page" : undefined} className={cn("font-semibold hover:underline", active ? "text-muted" : "text-ink")}>Alle</Link>
        </li>
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/blogs?rubrik=${c.slug}`} aria-current={active === c.slug ? "page" : undefined} className={cn("hover:text-ink hover:underline", active === c.slug ? "font-semibold text-ink underline underline-offset-4" : "text-muted")}>
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SearchBox({ q, rubrik }: { q?: string; rubrik?: string }) {
  return (
    <form role="search" action="/blogs" className="flex w-full max-w-sm items-center border-b border-ink">
      <label htmlFor="blog-q" className="sr-only">Artikel durchsuchen</label>
      <Search size={16} className="text-muted" aria-hidden />
      <input id="blog-q" name="q" type="search" defaultValue={q} placeholder="Artikel durchsuchen …" className="h-11 flex-1 bg-transparent px-3 text-[15px] outline-none" />
      {rubrik && <input type="hidden" name="rubrik" value={rubrik} />}
      <button type="submit" className="text-sm font-semibold">Suchen</button>
    </form>
  );
}

export default async function BlogsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const viewerId = user?.id ?? null;
  const categories = await listArticleCategories();
  const filtered = !!(sp.q || sp.rubrik || sp.tag);
  const today = formatDate(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const masthead = (
    <header className="mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
        <p className="spec">Blogs · {today}</p>
        {user && (
          <Link href="/studio/blog/neu" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
            <PenLine size={14} /> Selbst schreiben
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-6 pb-6 pt-8">
        <h1 className="display text-[3rem] leading-[0.95] sm:text-[4.5rem]">
          Aus den <em className="font-[380]">Werkstätten</em>
        </h1>
        <SearchBox q={sp.q} rubrik={sp.rubrik} />
      </div>
      <CategoryNav categories={categories} active={sp.rubrik} />
    </header>
  );

  if (filtered) {
    const cat = categories.find((c) => c.slug === sp.rubrik);
    const res = await listArticles({ q: sp.q, category: sp.rubrik, tag: sp.tag, viewerId, take: 18 }, sp.nach);
    const heading = [sp.q && `„${sp.q}“`, cat?.name, sp.tag && `#${sp.tag}`].filter(Boolean).join(" · ");
    const nextHref = res.nextCursor ? `/blogs?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.rubrik ? { rubrik: sp.rubrik } : {}), ...(sp.tag ? { tag: sp.tag } : {}), nach: res.nextCursor })}` : null;
    return (
      <Page width="wide">
        {masthead}
        <SectionTitle n="01" title={heading || "Artikel"} action={<span className="spec">{pluralize(res.items.length, "Treffer", "Treffer")}{res.nextCursor ? "+" : ""}</span>} />
        {res.items.length ? (
          <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {res.items.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        ) : (
          <Empty className="mt-8" title="Keine Artikel gefunden" body="Versuch es mit einem anderen Begriff oder stöbere in einer anderen Rubrik." action={<LinkButton href="/blogs" variant="outline">Alle Artikel</LinkButton>} />
        )}
        {nextHref && (
          <div className="mt-12 flex justify-center">
            <LinkButton href={nextHref} variant="outline">Weitere Artikel <ArrowRight size={14} /></LinkButton>
          </div>
        )}
      </Page>
    );
  }

  const idx = await getBlogIndex(viewerId);
  const grid = idx.latest.slice(0, 6);
  const rows = idx.latest.slice(6, 12);

  return (
    <Page width="wide">
      {masthead}

      {!idx.hero ? (
        <Empty
          title="Noch keine Artikel"
          body="Die ersten Werkstattberichte entstehen gerade. Schreib doch du den ersten."
          action={user ? <LinkButton href="/studio/blog/neu">Artikel schreiben</LinkButton> : <LinkButton href="/registrieren" variant="outline">Mitmachen</LinkButton>}
        />
      ) : (
        <>
          <ArticleCard article={idx.hero} variant="hero" priority />

          {grid.length > 0 && (
            <section aria-labelledby="neu" className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div>
                <SectionTitle n="01" title={<span id="neu">Neu erschienen</span>} />
                <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
                  {grid.map((a) => (
                    <ArticleCard key={a.id} article={a} />
                  ))}
                </div>
              </div>
              {rows.length > 0 && (
                <aside aria-label="Weitere neue Artikel">
                  <SectionTitle n="02" title="Ausserdem" />
                  <ol className="divide-y divide-line">
                    {rows.map((a, i) => (
                      <li key={a.id}>
                        <ArticleCard article={a} variant="row" index={i} />
                      </li>
                    ))}
                  </ol>
                </aside>
              )}
            </section>
          )}

          {idx.byCategory.map((g, gi) => (
            <section key={g.category.id} aria-labelledby={`rubrik-${g.category.slug}`} className="mt-16">
              <SectionTitle
                n={String(gi + 3).padStart(2, "0")}
                title={<span id={`rubrik-${g.category.slug}`}>{g.category.name}</span>}
                action={
                  <Link href={`/blogs?rubrik=${g.category.slug}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                    Alle <ArrowRight size={12} />
                  </Link>
                }
              />
              <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {g.items.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            </section>
          ))}

          {idx.authors.length > 0 && (
            <section aria-labelledby="autoren" className="mt-16">
              <SectionTitle n={String(idx.byCategory.length + 3).padStart(2, "0")} title={<span id="autoren">Stimmen aus der Community</span>} />
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {idx.authors.map((a) => (
                  <li key={a.userId} className="border border-line bg-paper">
                    <Link href={`/u/${a.handle}/blog`} className="group flex h-full gap-4 p-5 hover:bg-card">
                      <Avatar src={a.avatarUrl} name={a.displayName} size={48} />
                      <span className="min-w-0">
                        <span className="block font-semibold group-hover:underline">{a.displayName}</span>
                        <span className="spec">{pluralize(a.articles, "Artikel", "Artikel")}</span>
                        {a.bio && <span className="mt-1.5 line-clamp-2 block text-[13px] text-muted">{a.bio}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-16 grid gap-6 border-t border-ink pt-8 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="spec">Für Creator</p>
              <p className="headline mt-2 max-w-xl text-2xl">Erzähl, wie es entstanden ist. Mit Fotos, Materialtabellen und Projektkarten – direkt verknüpft mit deinem Projektfaden.</p>
            </div>
            <LinkButton href={user ? "/studio/blog/neu" : "/registrieren"} variant="ink">
              {user ? "Artikel schreiben" : "Konto erstellen"} <ArrowRight size={14} />
            </LinkButton>
          </section>
        </>
      )}
    </Page>
  );
}
