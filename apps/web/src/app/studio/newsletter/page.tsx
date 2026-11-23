import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mail, MousePointerClick, PenLine, Users } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { listMyNewsletters, newsletterMailConfigured } from "@/server/pro/newsletter";
import { PRO_NAME } from "@/server/pro/service";
import { PageHeader } from "@/components/shell/page";
import { Badge, Empty, Notice } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { ProMark } from "@/components/pro/pro-mark";
import { NEWSLETTER_STATUS_LABEL, rate, type NewsletterStatus } from "@/lib/newsletter";
import { BRAND } from "@/config/brand";
import { proHref } from "@/lib/pro-features";

export const metadata: Metadata = { title: "Newsletter" };
export const dynamic = "force-dynamic";

const TONE: Record<NewsletterStatus, "neutral" | "moss" | "warn" | "outline"> = { DRAFT: "outline", SCHEDULED: "moss", SENDING: "warn", SENT: "neutral" };
const day = (iso: string) => new Date(iso).toLocaleString("de-CH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
const pct = (n: number | null) => (n === null ? "–" : `${n} %`);

/** Creator Pro: Newsletter an Follower:innen – Übersicht mit Status und Zahlen */
export default async function NewsletterPage() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio/newsletter");
  const { pro, items, recipients, quota } = await listMyNewsletters(user);
  // Ohne Pro und ohne bisherige Newsletter: direkt zur Pro-Seite mit dieser Funktion
  if (!pro && !items.length) redirect(proHref("newsletter"));

  if (!pro && !items.length) {
    return (
      <div className="max-w-3xl">
        <PageHeader kicker={`${BRAND.name} Studio`} title="Newsletter" description="Schreib den Menschen, die dir folgen, direkt ins Postfach – zu neuen Projekten, Anleitungen oder Produkten." />
        <div className="rounded-2xl border border-line bg-card p-6">
          <ProMark />
          <h2 className="mt-3 text-xl font-bold">Newsletter gehören zu {PRO_NAME}</h2>
          <ul className="mt-4 space-y-3 text-[14.5px] text-ink-2">
            <li className="flex gap-3"><Users size={18} className="mt-0.5 shrink-0 text-moss" aria-hidden /> An alle, die dir folgen{recipients ? ` – heute ${recipients.toLocaleString("de-CH")} ${recipients === 1 ? "Person" : "Personen"}` : ""}. Abmelden geht mit einem Klick.</li>
            <li className="flex gap-3"><PenLine size={18} className="mt-0.5 shrink-0 text-moss" aria-hidden /> Text mit Karten zu deinen Projekten, Anleitungen und Produkten, Vorschau wie im Postfach.</li>
            <li className="flex gap-3"><MousePointerClick size={18} className="mt-0.5 shrink-0 text-moss" aria-hidden /> Jetzt senden oder planen, danach Öffnungen und Klicks sehen.</li>
          </ul>
          <LinkButton href="/studio/pro" className="mt-6">
            {PRO_NAME} ansehen
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        kicker={`${BRAND.name} Studio · ${PRO_NAME}`}
        title="Newsletter"
        description="Schreib den Menschen, die dir folgen, direkt ins Postfach. Werkuno verschickt für dich – mit Abmeldelink in jeder Mail."
        actions={
          pro ? (
            <LinkButton href="/studio/newsletter/neu">
              <PenLine size={15} aria-hidden /> Neuer Newsletter
            </LinkButton>
          ) : undefined
        }
      />

      {!pro && (
        <Notice tone="warn" className="mb-6" title={`${PRO_NAME} ist nicht aktiv`}>
          Deine bisherigen Newsletter bleiben sichtbar. Neue schreiben und senden kannst du wieder mit <Link href={proHref("newsletter")} className="underline">{PRO_NAME}</Link>.
        </Notice>
      )}
      {!newsletterMailConfigured() && (
        <Notice className="mb-6" title="Testumgebung">
          Ohne E-Mail-Dienst werden Newsletter nur protokolliert, nicht zugestellt.
        </Notice>
      )}

      <dl className="mb-10 grid grid-cols-2 border-y border-rule py-4 sm:grid-cols-3">
        <div>
          <dt className="spec">Empfänger:innen</dt>
          <dd className="num mt-1 font-mono text-xl">{recipients.toLocaleString("de-CH")}</dd>
        </div>
        <div>
          <dt className="spec">In 30 Tagen</dt>
          <dd className="num mt-1 font-mono text-xl">
            {quota.used} / {quota.limit}
          </dd>
        </div>
        <div className="hidden sm:block">
          <dt className="spec">Verschickt</dt>
          <dd className="num mt-1 font-mono text-xl">{items.filter((n) => n.status === "SENT").length}</dd>
        </div>
      </dl>

      {items.length === 0 ? (
        <Empty
          title="Noch kein Newsletter"
          body="Erzähl deinen Follower:innen, woran du gerade arbeitest – mit Karten zu deinen neuesten Projekten, Anleitungen oder Produkten."
          action={<LinkButton href="/studio/newsletter/neu">Ersten Newsletter schreiben</LinkButton>}
        />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={`/studio/newsletter/${n.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-4 hover:bg-sunken/60 sm:flex-nowrap">
                <Mail size={16} className="shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{n.subject}</span>
                  <span className="block text-[13px] text-muted">
                    {n.status === "SENT" && n.sentAt ? `Verschickt ${day(n.sentAt)}` : n.status === "SCHEDULED" && n.scheduledAt ? `Geplant für ${day(n.scheduledAt)}` : `Bearbeitet ${day(n.updatedAt)}`}
                  </span>
                </span>
                <Badge tone={TONE[n.status]}>{NEWSLETTER_STATUS_LABEL[n.status]}</Badge>
                {(n.status === "SENT" || n.status === "SENDING") && (
                  <span className="num flex gap-4 text-[13px] text-ink-2">
                    <span title="Empfänger:innen">{n.recipientCount.toLocaleString("de-CH")} Empf.</span>
                    <span title="Öffnungsrate">{pct(rate(n.openCount, n.recipientCount))} geöffnet</span>
                    <span title="Klickrate">{pct(rate(n.clickCount, n.recipientCount))} geklickt</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 max-w-2xl text-[12.5px] leading-relaxed text-muted">
        Öffnungen sind Schätzwerte: Manche Postfächer laden Bilder vorab oder gar nicht. Klicks sind genauer. Personen, die Newsletter abbestellt haben, bekommen keine Mail – auch wenn sie dir weiterhin folgen.
      </p>
    </div>
  );
}
