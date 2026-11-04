import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { categoryBySlug } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { listStudioTutorials } from "@/server/tutorials/service";
import { PageHeader } from "@/components/shell/page";
import { LinkButton } from "@/components/ui/button";
import { Badge, Empty, Stat } from "@/components/ui/misc";
import { TutorialRowActions } from "@/components/tutorials/studio-row-actions";
import { compactNumber, relativeTime } from "@/lib/utils";

export const metadata = { title: "Anleitungen" };

const STATE: Record<string, { label: string; tone: "moss" | "neutral" | "warn" | "outline" }> = {
  PUBLISHED: { label: "Veröffentlicht", tone: "moss" },
  DRAFT: { label: "Entwurf", tone: "outline" },
  HIDDEN: { label: "Ausgeblendet", tone: "warn" },
};

export default async function StudioTutorials() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/studio/anleitungen");
  const rows = await listStudioTutorials(user.id);
  const published = rows.filter((r) => r.state === "PUBLISHED");
  const sum = (k: "viewCount" | "completionCount" | "saveCount") => published.reduce((a, r) => a + r[k], 0);

  return (
    <div className="max-w-[1100px]">
      <PageHeader
        kicker="Studio · Anleitungen"
        title="Anleitungen"
        description="Entwürfe, Versionen und wie oft deine Anleitungen nachgebaut wurden."
        actions={<LinkButton href="/studio/anleitungen/neu" variant="ink"><Plus size={16} /> Neue Anleitung</LinkButton>}
      />
      {rows.length > 0 && (
        <div className="mb-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Veröffentlicht" value={published.length} note={`${rows.length - published.length} weitere im Entwurf`} />
          <Stat label="Aufrufe" value={compactNumber(sum("viewCount"))} note="Seitenaufrufe, ohne deine eigenen" />
          <Stat label="Nachgebaut" value={compactNumber(sum("completionCount"))} note="als «nachgebaut» markiert" />
          <Stat label="Gemerkt" value={compactNumber(sum("saveCount"))} note="aktuell gespeichert" />
        </div>
      )}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className="spec py-2 pr-3 font-normal">Titel</th>
                <th scope="col" className="spec py-2 pr-3 font-normal">Status</th>
                <th scope="col" className="spec py-2 pr-3 text-right font-normal">Version</th>
                <th scope="col" className="spec py-2 pr-3 text-right font-normal">Aufrufe</th>
                <th scope="col" className="spec py-2 pr-3 text-right font-normal">Lesende</th>
                <th scope="col" className="spec py-2 pr-3 text-right font-normal">Nachgebaut</th>
                <th scope="col" className="spec py-2 pr-3 font-normal">Geändert</th>
                <th scope="col" className="w-10 py-2"><span className="sr-only">Aktionen</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATE[r.state] ?? STATE.DRAFT!;
                return (
                  <tr key={r.id} className="border-b border-line align-middle">
                    <td className="max-w-[320px] py-3 pr-3">
                      <Link href={`/studio/anleitungen/${r.id}`} className="block truncate font-semibold hover:underline">{r.title}</Link>
                      <span className="spec">{categoryBySlug(r.category)?.short ?? r.category}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {r.hasUnpublishedChanges && r.currentVersion && <Badge tone="clay">Änderungen offen</Badge>}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right font-mono text-[12px] num">{r.currentVersion ? `v${r.currentVersion.version}` : "–"}</td>
                    <td className="py-3 pr-3 text-right num">{compactNumber(r.viewCount)}</td>
                    <td className="py-3 pr-3 text-right num">{compactNumber(r._count.progress)}</td>
                    <td className="py-3 pr-3 text-right num">{compactNumber(r.completionCount)}</td>
                    <td className="whitespace-nowrap py-3 pr-3 text-muted">{relativeTime(r.updatedAt)}</td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.currentVersion && r.state === "PUBLISHED" && (
                          <Link href={`/anleitungen/${r.slug}`} className="spec px-2 hover:text-ink">Ansehen</Link>
                        )}
                        <TutorialRowActions id={r.id} title={r.title} state={r.state} hasVersion={!!r.currentVersion} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-4 text-[12px] text-muted">«Lesende» = Konten, die mindestens einen Schritt abgehakt oder die Anleitung abgeschlossen haben.</p>
        </div>
      ) : (
        <Empty title="Noch keine Anleitung" body="Aus jedem Projekt kann eine Schritt-für-Schritt-Anleitung werden – mit Materialliste und Sicherheitshinweisen." action={<LinkButton href="/studio/anleitungen/neu" variant="ink">Erste Anleitung schreiben</LinkButton>} />
      )}
    </div>
  );
}
