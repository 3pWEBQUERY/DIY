import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requirePageUser } from "@/server/auth/session";
import { listMyArticles } from "@/server/blog/service";
import { PageHeader, TabLinks } from "@/components/shell/page";
import { LinkButton } from "@/components/ui/button";
import { Badge, Empty, Stat } from "@/components/ui/misc";
import { Cover } from "@/components/ui/media";
import { compactNumber, formatDate, relativeTime } from "@/lib/utils";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Blog" };

const FILTERS = [
  { key: "alle", label: "Alle" },
  { key: "entwuerfe", label: "Entwürfe", state: "DRAFT" },
  { key: "geplant", label: "Geplant", state: "SCHEDULED" },
  { key: "veroeffentlicht", label: "Veröffentlicht", state: "PUBLISHED" },
] as const;

const STATE = {
  DRAFT: { label: "Entwurf", tone: "outline" },
  SCHEDULED: { label: "Geplant", tone: "clay" },
  PUBLISHED: { label: "Veröffentlicht", tone: "moss" },
  HIDDEN: { label: "Ausgeblendet", tone: "danger" },
  REMOVED: { label: "Entfernt", tone: "danger" },
} as const;

export default async function StudioBlogPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePageUser("/studio/blog").catch(() => null);
  if (!user) redirect("/anmelden?weiter=/studio/blog");
  const sp = await searchParams;
  const all = await listMyArticles(user.id);
  const filter = FILTERS.find((f) => f.key === sp.status) ?? FILTERS[0];
  const rows = "state" in filter ? all.filter((a) => a.state === filter.state) : all;
  const published = all.filter((a) => a.state === "PUBLISHED");
  const totals = {
    views: published.reduce((n, a) => n + a.viewCount, 0),
    likes: published.reduce((n, a) => n + a.likeCount, 0),
    comments: published.reduce((n, a) => n + a.commentCount, 0),
  };

  return (
    <div className="max-w-[1100px]">
      <PageHeader
        kicker={`${BRAND.name} Studio · Blog`}
        title="Deine Artikel"
        description="Schreibe Werkstattberichte, Materialkunde oder Hintergründe zu deinen Projekten. Entwürfe sind nur für dich sichtbar."
        actions={
          <LinkButton href="/studio/blog/neu">
            <Plus size={15} /> Neuer Artikel
          </LinkButton>
        }
      />

      <dl className="mb-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Veröffentlicht" value={published.length} note={`${all.length - published.length} weitere in Arbeit`} />
        <Stat label="Aufrufe" value={compactNumber(totals.views)} note="Seitenaufrufe, nicht eindeutig" />
        <Stat label="Gefällt mir" value={compactNumber(totals.likes)} />
        <Stat label="Kommentare" value={compactNumber(totals.comments)} />
      </dl>

      <TabLinks
        active={filter.key}
        tabs={FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          href: f.key === "alle" ? "/studio/blog" : `/studio/blog?status=${f.key}`,
          count: "state" in f ? all.filter((a) => a.state === f.state).length : all.length,
        }))}
      />

      {rows.length === 0 ? (
        <Empty
          className="mt-8"
          title={all.length ? "Hier ist nichts" : "Noch kein Artikel"}
          body={all.length ? "In dieser Ansicht gibt es keine Artikel." : "Dein erster Artikel kann ein Bericht über ein abgeschlossenes Projekt sein – mit Fotos, Materialtabelle und Projektkarte."}
          action={<LinkButton href="/studio/blog/neu" variant="outline">Ersten Artikel schreiben</LinkButton>}
        />
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Artikelübersicht</caption>
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className="spec py-3 pr-4 font-normal">Artikel</th>
                <th scope="col" className="spec py-3 pr-4 font-normal">Status</th>
                <th scope="col" className="spec py-3 pr-4 text-right font-normal">Aufrufe</th>
                <th scope="col" className="spec py-3 pr-4 text-right font-normal">Gefällt mir</th>
                <th scope="col" className="spec py-3 pr-4 text-right font-normal">Kommentare</th>
                <th scope="col" className="spec py-3 font-normal"><span className="sr-only">Aktionen</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="group border-b border-line align-middle hover:bg-card">
                  <td className="py-3 pr-4">
                    <Link href={`/studio/blog/${a.id}`} className="flex items-center gap-4">
                      <Cover url={a.coverUrl} alt="" seed={a.id} ratio="4/3" className="w-20 shrink-0 border border-line rounded-2xl" sizes="80px" />
                      <span className="min-w-0">
                        <span className="headline block truncate text-[17px] group-hover:underline">{a.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {a.category?.name ? `${a.category.name} · ` : ""}
                          {a.readingMinutes} Min. · bearbeitet {relativeTime(a.updatedAt)}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={STATE[a.state].tone}>{STATE[a.state].label}</Badge>
                    {a.publishedAt && a.state !== "DRAFT" && (
                      <span className="mt-1 block text-xs text-muted num">{formatDate(a.publishedAt, a.state === "SCHEDULED" ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" })}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono num">{a.state === "PUBLISHED" ? compactNumber(a.viewCount) : "–"}</td>
                  <td className="py-3 pr-4 text-right font-mono num">{a.state === "PUBLISHED" ? compactNumber(a.likeCount) : "–"}</td>
                  <td className="py-3 pr-4 text-right font-mono num">{a.state === "PUBLISHED" ? compactNumber(a.commentCount) : "–"}</td>
                  <td className="py-3 text-right whitespace-nowrap">
                    {a.state === "PUBLISHED" && (
                      <Link href={`/u/${user.profile.handle}/blog/${a.slug}`} className="mr-4 text-xs text-muted hover:text-ink">Ansehen</Link>
                    )}
                    <Link href={`/studio/blog/${a.id}`} className="text-xs font-semibold hover:underline">Bearbeiten</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
