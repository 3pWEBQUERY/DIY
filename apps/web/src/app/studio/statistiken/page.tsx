import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { contentStats } from "@/server/analytics/studio";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/admin/ui";
import { Sparkline } from "@/components/admin/sparkline";
import { num, shortDate, weekLabel } from "@/components/admin/format";
import { SectionTitle } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Statistiken" };
export const dynamic = "force-dynamic";

export default async function StudioStatsPage() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio/statistiken");
  const s = await contentStats(user.id);
  const labels = s.weeks.map(weekLabel);
  const trend = (id: string) => <Sparkline values={s.trend(id)} labels={labels} label="Aufrufe pro Woche" width={96} height={24} />;
  const handle = user.profile.handle;

  return (
    <div className="max-w-[1100px]">
      <header className="mb-10">
        <p className="spec mb-3 flex items-center gap-2"><span className="inline-block h-px w-6 bg-ink" />Je Inhalt · Verlauf der letzten 12 Wochen</p>
        <h1 className="display text-[2.4rem] sm:text-5xl">Statistiken</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          „Aufrufe“ sind Seitenaufrufe, nicht eindeutige Besucher. Gemerkt und Nachbauten sagen oft mehr über den Wert eines Projekts als Aufrufe – sie zeigen, dass jemand es selbst machen will.
        </p>
      </header>

      <section aria-labelledby="st1" className="mb-12">
        <SectionTitle n="01" title={<span id="st1">Projekte</span>} />
        <Table className="mt-3" caption="Projekte">
          <thead>
            <tr>
              <Th>Projekt</Th>
              <Th align="right">Aufrufe</Th>
              <Th align="right">Gefällt-mir</Th>
              <Th align="right">Gemerkt</Th>
              <Th align="right">Kommentare</Th>
              <Th align="right">Nachbauten</Th>
              <Th>Trend (Aufrufe)</Th>
            </tr>
          </thead>
          <tbody>
            {s.projects.length === 0 && <EmptyRow cols={7}>Noch keine veröffentlichten Projekte.</EmptyRow>}
            {s.projects.map((p) => (
              <Tr key={p.id}>
                <Td className="max-w-[320px]"><span className="line-clamp-1 font-semibold">{p.title}</span><span className="text-xs text-muted">{p.publishedAt ? `seit ${shortDate(p.publishedAt)}` : ""}</span></Td>
                <Td align="right">{num(p.viewCount)}</Td>
                <Td align="right">{num(p.likeCount)}</Td>
                <Td align="right">{num(p.saveCount)}</Td>
                <Td align="right">{num(p.commentCount)}</Td>
                <Td align="right" className={p.remixCount ? "font-semibold text-moss" : ""}>{num(p.remixCount)}</Td>
                <Td>{trend(p.id)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section aria-labelledby="st2" className="mb-12">
        <SectionTitle n="02" title={<span id="st2">Anleitungen</span>} />
        <Table className="mt-3" caption="Anleitungen">
          <thead>
            <tr>
              <Th>Anleitung</Th>
              <Th align="right">Aufrufe</Th>
              <Th align="right">Gefällt-mir</Th>
              <Th align="right">Gemerkt</Th>
              <Th align="right">Abgeschlossen</Th>
              <Th align="right">Abschlussquote</Th>
              <Th>Trend (Aufrufe)</Th>
            </tr>
          </thead>
          <tbody>
            {s.tutorials.length === 0 && <EmptyRow cols={7}>Noch keine veröffentlichten Anleitungen.</EmptyRow>}
            {s.tutorials.map((t) => (
              <Tr key={t.id}>
                <Td className="max-w-[320px]"><span className="line-clamp-1 font-semibold">{t.title}</span></Td>
                <Td align="right">{num(t.viewCount)}</Td>
                <Td align="right">{num(t.likeCount)}</Td>
                <Td align="right">{num(t.saveCount)}</Td>
                <Td align="right">{num(t.completionCount)}</Td>
                <Td align="right" className="text-muted">{t.viewCount ? `${Math.round((t.completionCount / t.viewCount) * 1000) / 10} %` : "–"}</Td>
                <Td>{trend(t.id)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-muted">Abschlussquote = abgeschlossene Durchgänge / Aufrufe (Schätzung).</p>
      </section>

      <section aria-labelledby="st3" className="mb-12">
        <SectionTitle n="03" title={<span id="st3">Beiträge</span>} />
        <Table className="mt-3" caption="Beiträge">
          <thead>
            <tr>
              <Th>Beitrag</Th>
              <Th align="right">Gefällt-mir</Th>
              <Th align="right">Gemerkt</Th>
              <Th align="right">Kommentare</Th>
              <Th align="right">Geteilt</Th>
              <Th>Datum</Th>
            </tr>
          </thead>
          <tbody>
            {s.posts.length === 0 && <EmptyRow cols={6}>Noch keine Beiträge.</EmptyRow>}
            {s.posts.map((p) => (
              <Tr key={p.id}>
                <Td className="max-w-[380px]"><Link href={`/beitrag/${p.id}`} className="line-clamp-1 hover:underline">{p.body.slice(0, 120) || "Beitrag ohne Text"}</Link></Td>
                <Td align="right">{num(p.likeCount)}</Td>
                <Td align="right">{num(p.saveCount)}</Td>
                <Td align="right">{num(p.commentCount)}</Td>
                <Td align="right">{num(p.repostCount)}</Td>
                <Td className="whitespace-nowrap text-muted">{shortDate(p.publishedAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </section>

      {s.articles.length > 0 && (
        <section aria-labelledby="st4" className="mb-12">
          <SectionTitle n="04" title={<span id="st4">Artikel</span>} />
          <Table className="mt-3" caption="Artikel">
            <thead>
              <tr>
                <Th>Artikel</Th>
                <Th align="right">Aufrufe</Th>
                <Th align="right">Gefällt-mir</Th>
                <Th>Trend (Aufrufe)</Th>
              </tr>
            </thead>
            <tbody>
              {s.articles.map((a) => (
                <Tr key={a.id}>
                  <Td className="max-w-[380px]"><span className="line-clamp-1 font-semibold">{a.title}</span></Td>
                  <Td align="right">{num(a.viewCount)}</Td>
                  <Td align="right">{num(a.likeCount)}</Td>
                  <Td>{trend(a.id)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}

      {s.products.length > 0 && (
        <section aria-labelledby="st5" className="mb-12">
          <SectionTitle n="05" title={<span id="st5">Produkte</span>} />
          <Table className="mt-3" caption="Produkte">
            <thead>
              <tr>
                <Th>Produkt</Th>
                <Th align="right">Aufrufe</Th>
                <Th align="right">Gemerkt</Th>
                <Th align="right">Verkaufte Positionen</Th>
                <Th align="right">Bewertungen</Th>
                <Th>Trend (Aufrufe)</Th>
              </tr>
            </thead>
            <tbody>
              {s.products.map((p) => (
                <Tr key={p.id}>
                  <Td className="max-w-[320px]"><span className="line-clamp-1 font-semibold">{p.title}</span></Td>
                  <Td align="right">{num(p.viewCount)}</Td>
                  <Td align="right">{num(p.saveCount)}</Td>
                  <Td align="right">{num(p._count.orderItems)}</Td>
                  <Td align="right">{num(p.ratingCount)}</Td>
                  <Td>{trend(p.id)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
      <p className="text-xs text-muted">
        Dein öffentliches Profil: <Link href={`/u/${handle}`} className="underline">/u/{handle}</Link>
      </p>
    </div>
  );
}
