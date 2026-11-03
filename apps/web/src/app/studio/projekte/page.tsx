import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { VISIBILITY_LABEL, categoryBySlug } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { listStudioProjects } from "@/server/projects/service";
import { PageHeader } from "@/components/shell/page";
import { LinkButton } from "@/components/ui/button";
import { Badge, Empty, Stat } from "@/components/ui/misc";
import { Plate } from "@/components/ui/media";
import { StatusLabel } from "@/components/projects/status";
import { compactNumber, relativeTime } from "@/lib/utils";

export const metadata = { title: "Meine Projekte" };

export default async function StudioProjects() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio/projekte");
  const rows = await listStudioProjects(user.id);
  const handle = user.profile.handle;
  const total = (k: "viewCount" | "likeCount" | "saveCount" | "remixCount") => rows.reduce((a, r) => a + r[k], 0);

  return (
    <div className="max-w-[1200px]">
      <PageHeader
        kicker="Studio · Projekte"
        title="Meine Projekte"
        description="Alle Werkblätter auf einen Blick – mit ehrlich beschrifteten Kennzahlen."
        actions={<LinkButton href="/projekte/neu" variant="ink"><Plus size={16} /> Neues Projekt</LinkButton>}
      />
      {rows.length > 0 && (
        <div className="mb-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Projekte" value={rows.length} note={`${rows.filter((r) => r.status === "COMPLETED").length} abgeschlossen`} />
          <Stat label="Aufrufe" value={compactNumber(total("viewCount"))} note="Projektseite, ohne deine eigenen" />
          <Stat label="Gemerkt" value={compactNumber(total("saveCount"))} note="aktuell gespeichert" />
          <Stat label="Nachbauten" value={compactNumber(total("remixCount"))} note="verknüpfte Nachbau-Projekte" />
        </div>
      )}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-ink text-left">
                <th scope="col" className="spec py-2 pr-3 font-normal">Projekt</th>
                <th scope="col" className="spec py-2 pr-3 font-normal">Status</th>
                <th scope="col" className="spec py-2 pr-3 font-normal">Sichtbarkeit</th>
                <th scope="col" className="spec py-2 pr-3 text-right font-normal">Einträge</th>
                <th scope="col" className="spec py-2 pr-3 text-right font-normal">Aufrufe</th>
                <th scope="col" className="spec py-2 pr-3 text-right font-normal">Likes</th>
                <th scope="col" className="spec py-2 pr-3 text-right font-normal">Gemerkt</th>
                <th scope="col" className="spec py-2 pr-3 text-right font-normal">Nachbauten</th>
                <th scope="col" className="spec py-2 pr-3 font-normal">Geändert</th>
                <th scope="col" className="py-2"><span className="sr-only">Aktionen</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = `/u/${handle}/${r.slug}`;
                return (
                  <tr key={r.id} className="border-b border-line align-middle">
                    <td className="py-2.5 pr-3">
                      <Link href={href} className="group flex max-w-[340px] items-center gap-3">
                        <span className="relative size-10 shrink-0 overflow-hidden border border-line">
                          {r.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                          ) : (
                            <Plate seed={r.id} category={r.category} number={false} />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold group-hover:underline">{r.title}</span>
                          <span className="spec">{categoryBySlug(r.category)?.short ?? r.category}{r._count.followers ? ` · ${r._count.followers} folgen` : ""}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-[13px]"><StatusLabel status={r.status} /></td>
                    <td className="py-2.5 pr-3">
                      {r.state === "HIDDEN" ? <Badge tone="warn">Ausgeblendet</Badge> : <Badge tone={r.visibility === "PUBLIC" ? "neutral" : "outline"}>{VISIBILITY_LABEL[r.visibility]}</Badge>}
                    </td>
                    <td className="py-2.5 pr-3 text-right num">{r._count.updates}</td>
                    <td className="py-2.5 pr-3 text-right num">{compactNumber(r.viewCount)}</td>
                    <td className="py-2.5 pr-3 text-right num">{compactNumber(r.likeCount)}</td>
                    <td className="py-2.5 pr-3 text-right num">{compactNumber(r.saveCount)}</td>
                    <td className="py-2.5 pr-3 text-right num">{compactNumber(r.remixCount)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{relativeTime(r.updatedAt)}</td>
                    <td className="whitespace-nowrap py-2.5 text-right">
                      <Link href={`${href}#fortschritt`} className="spec px-2 hover:text-ink">Eintrag</Link>
                      <Link href={`${href}/bearbeiten`} className="spec px-2 hover:text-ink">Bearbeiten</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Noch keine Projekte" body="Leg dein erstes Werkblatt an – Journal, Anleitung und Produkte hängen später daran." action={<LinkButton href="/projekte/neu" variant="ink">Projekt anlegen</LinkButton>} />
      )}
    </div>
  );
}
