import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { COMMENT_FILTER_MAX } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getCommentFilter } from "@/server/pro/comment-tools";
import { PageHeader } from "@/components/shell/page";
import { Empty, Notice, SectionTitle } from "@/components/ui/misc";
import { CommentFilterForm, FilteredCommentList, RetroFilterButton } from "@/components/pro/comment-filter-form";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Kommentare" };

/** Studio: Wortfilter für Kommentare und ausgeblendete Kommentare prüfen (Creator Pro). */
export default async function StudioCommentsPage() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/studio/kommentare");
  const f = await getCommentFilter(user.id);

  return (
    <div className="max-w-3xl">
      <PageHeader
        kicker={`${BRAND.name} Studio · Creator Pro`}
        title="Kommentare"
        description="Halte die Diskussion unter deinen Inhalten freundlich: Wörter filtern, Kommentare anheften und Kommentare schliessen."
      />

      {!f.pro && (
        <Notice tone="neutral" className="mb-8" title="Gehört zu Creator Pro">
          Wortfilter, angeheftete Kommentare und geschlossene Kommentare gibt es mit Creator Pro.{" "}
          <Link href="/studio/pro" className="font-semibold underline">
            Creator Pro ansehen
          </Link>
        </Notice>
      )}

      <section aria-labelledby="wortfilter" className="mb-12">
        <SectionTitle n="01" title={<span id="wortfilter">Wortfilter</span>} className="mb-3" />
        <p className="mb-5 max-w-2xl text-[14px] leading-relaxed text-ink-2">
          Neue Kommentare unter deinen Beiträgen, Projekten, Anleitungen und Artikeln, die eines dieser Wörter enthalten, werden automatisch ausgeblendet. Die Person, die
          ihn geschrieben hat, sieht ihren Kommentar weiterhin – alle anderen nicht. Du findest ausgeblendete Kommentare unten und direkt am Inhalt, und kannst sie
          einblenden. Gross-/Kleinschreibung und Umlaute spielen keine Rolle; Wörter ab 4 Zeichen treffen auch als Teil längerer Wörter, kürzere nur als ganzes Wort.
          Höchstens {COMMENT_FILTER_MAX} Wörter.
        </p>
        <CommentFilterForm initial={f.words} pro={f.pro} />
        <RetroFilterButton pro={f.pro} hasWords={f.words.length > 0} />
      </section>

      <section aria-labelledby="ausgeblendet" className="mb-12">
        <SectionTitle n="02" title={<span id="ausgeblendet">Ausgeblendete Kommentare</span>} className="mb-5" />
        {f.hidden.length ? <FilteredCommentList items={f.hidden} /> : <Empty title="Nichts ausgeblendet" body="Hier erscheinen Kommentare, die dein Wortfilter ausgeblendet hat." />}
      </section>

      <section aria-labelledby="anheften">
        <SectionTitle n="03" title={<span id="anheften">Anheften und schliessen</span>} className="mb-3" />
        <p className="max-w-2xl text-[14px] leading-relaxed text-ink-2">
          Unter deinen eigenen Inhalten findest du bei jedem Hauptkommentar „Anheften“ – angeheftet steht er ganz oben, gut sichtbar mit „Angeheftet von dir“. Pro Inhalt
          ist ein Kommentar angeheftet; ein neuer ersetzt den bisherigen. Über dem Kommentarbereich deiner Beiträge, Projekte und Anleitungen kannst du die Kommentare
          schliessen und wieder öffnen. Bei Artikeln schaltest du Kommentare in den Artikel-Einstellungen aus.
        </p>
      </section>
    </div>
  );
}
