import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { APPEAL_WINDOW_DAYS, MODERATION_ACTION_LABEL, type ModerationActionKind } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { appealContext } from "@/server/moderation/service";
import { TARGET_TYPE_LABEL } from "@/server/admin/guard";
import { Page, PageHeader } from "@/components/shell/page";
import { Notice, SectionTitle } from "@/components/ui/misc";
import { BRAND } from "@/config/brand";
import { formatDate } from "@/lib/utils";
import { AppealForm } from "./appeal-form";

export const metadata: Metadata = { title: "Einspruch", robots: { index: false } };

/** Einspruch gegen eine Moderationsentscheidung (PRD §24.1 Nr. 7) – nur für die betroffene Person. */
export default async function AppealPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const user = await currentUser();
  if (!user) redirect(`/anmelden?weiter=${encodeURIComponent(`/einspruch/${caseId}`)}`);
  const ctx = await appealContext(user.id, caseId);
  if (!ctx) notFound();

  const d = ctx.decision;
  const expired = !!ctx.deadline && ctx.deadline < new Date();
  const fmt = (x: Date) => formatDate(x, { day: "numeric", month: "long", year: "numeric" });

  return (
    <Page width="narrow">
      <PageHeader kicker={`Fall Nº ${ctx.number}`} title="Einspruch" description="Wir nehmen Entscheidungen ernst – auch die eigenen. Wenn du denkst, dass wir falsch lagen, kannst du sie hier anfechten." />

      <section aria-labelledby="e1" className="mb-10">
        <SectionTitle n="01" title={<span id="e1">Die Entscheidung</span>} />
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-b border-line pb-5 text-sm">
          <div>
            <dt className="spec">Betroffen</dt>
            <dd className="mt-1">
              {TARGET_TYPE_LABEL[ctx.targetType] ?? "Inhalt"}
              {ctx.title ? ` „${ctx.title}“` : ""}
            </dd>
          </div>
          <div>
            <dt className="spec">Grund der Meldung</dt>
            <dd className="mt-1">{ctx.reasonLabel}</dd>
          </div>
          <div>
            <dt className="spec">Massnahme</dt>
            <dd className="mt-1 font-semibold">{d ? MODERATION_ACTION_LABEL[d.action as ModerationActionKind] : "Noch keine Entscheidung"}</dd>
          </div>
          <div>
            <dt className="spec">Entschieden am</dt>
            <dd className="mt-1">{d ? fmt(d.createdAt) : "–"}</dd>
          </div>
          {d?.until && (
            <div className="col-span-2">
              <dt className="spec">Gültig bis</dt>
              <dd className="mt-1">{fmt(d.until)}</dd>
            </div>
          )}
        </dl>
        {d?.publicNote && (
          <blockquote className="mt-5 border-l-2 border-clay pl-4 font-serif text-[17px] leading-relaxed text-ink-2">{d.publicNote}</blockquote>
        )}
      </section>

      <section aria-labelledby="e2">
        <SectionTitle n="02" title={<span id="e2">Dein Einspruch</span>} />
        <div className="mt-5">
          {ctx.appeal ? (
            <Notice tone={ctx.appeal.status === "OVERTURNED" ? "moss" : ctx.appeal.status === "UPHELD" ? "neutral" : "warn"} title={ctx.appeal.status === "OPEN" ? "In Prüfung" : ctx.appeal.status === "OVERTURNED" ? "Stattgegeben" : "Abgelehnt"}>
              <p>
                Eingereicht am {fmt(ctx.appeal.createdAt)}.{" "}
                {ctx.appeal.status === "OPEN" && "Eine andere Person aus dem Team prüft ihn. Du erhältst eine Benachrichtigung mit dem Ergebnis."}
                {ctx.appeal.status === "OVERTURNED" && "Die Massnahme wurde aufgehoben und der vorherige Zustand wiederhergestellt."}
                {ctx.appeal.status === "UPHELD" && "Die Entscheidung bleibt bestehen. Die Prüfung des Einspruchs ist abschliessend."}
              </p>
              {ctx.appeal.decision && <p className="mt-2 italic">„{ctx.appeal.decision}“</p>}
            </Notice>
          ) : ctx.canAppeal ? (
            <>
              <p className="mb-4 text-sm text-muted">Frist: bis {ctx.deadline ? fmt(ctx.deadline) : "–"} ({APPEAL_WINDOW_DAYS} Tage nach der Entscheidung).</p>
              <AppealForm caseId={ctx.id} />
            </>
          ) : (
            <Notice title={expired ? "Frist abgelaufen" : "Kein Einspruch möglich"}>
              {expired
                ? `Die Einspruchsfrist von ${APPEAL_WINDOW_DAYS} Tagen ist abgelaufen.`
                : ctx.status === "OPEN" || ctx.status === "IN_REVIEW"
                  ? "Zu diesem Fall gibt es noch keine Entscheidung."
                  : "Zu diesem Fall wurde keine Massnahme verhängt, die angefochten werden kann."}{" "}
              Bei Fragen erreichst du uns über <Link href="/einstellungen/hilfe-support" className="underline">Hilfe & Support</Link> oder {BRAND.supportEmail}.
            </Notice>
          )}
        </div>
        <p className="mt-8 text-xs leading-relaxed text-muted">
          Wie wir moderieren, beschreiben die <Link href="/richtlinien/community" className="underline">Community-Richtlinien</Link>. Ausserhalb der Plattform stehen dir weiterhin alle gesetzlichen Rechtsbehelfe offen.
        </p>
      </section>
    </Page>
  );
}
