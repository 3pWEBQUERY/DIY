import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatMoney } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getMySupportStudio } from "@/server/supporters/service";
import { PageHeader } from "@/components/shell/page";
import { Avatar, Badge, Empty, Notice, SectionTitle } from "@/components/ui/misc";
import { SupportPlanForm } from "@/components/supporters/support-plan-form";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Unterstützer:innen" };

const day = (iso: string) => new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Zurich" });

/** Studio: Unterstützer-Abo einrichten, Zahlen und Liste der Unterstützer:innen. */
export default async function StudioSupportersPage() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/studio/unterstuetzer");
  const s = await getMySupportStudio(user.id);

  return (
    <div>
      <PageHeader
        kicker={`${BRAND.name} Studio · Community`}
        title="Unterstützer:innen"
        description="Fans unterstützen dich monatlich und bekommen dafür exklusive Anleitungen. Markiere dazu eine Anleitung im Editor als „Nur für Unterstützer:innen“."
      />

      {!s.eligibility.ok && (
        <Notice tone="warn" className="mb-8" title="Noch nicht bereit für Auszahlungen">
          {s.eligibility.reason}{" "}
          <Link href="/studio/shop" className="font-semibold underline">
            Zur Shopverwaltung
          </Link>
        </Notice>
      )}

      <dl className="mb-10 grid grid-cols-3 border-y border-rule py-4">
        <div>
          <dt className="spec">Aktiv</dt>
          <dd className="num mt-1 font-mono text-xl">{s.stats.active}</dd>
        </div>
        <div>
          <dt className="spec">Letzte 30 Tage</dt>
          <dd className="num mt-1 font-mono text-xl">{formatMoney(s.stats.last30NetMinor, s.currency)}</dd>
        </div>
        <div>
          <dt className="spec">Exklusive Anleitungen</dt>
          <dd className="num mt-1 font-mono text-xl">{s.exclusiveTutorials}</dd>
        </div>
      </dl>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="abo">
          <SectionTitle n="01" title={<span id="abo">Dein Unterstützer-Abo</span>} className="mb-5" />
          <SupportPlanForm plan={s.plan} tiers={s.tiers} feeBps={s.feeBps} eligible={s.eligibility.ok} currency={s.currency} />
        </section>

        <section aria-labelledby="liste">
          <SectionTitle n="02" title={<span id="liste">Wer dich unterstützt</span>} className="mb-5" />
          {s.supporters.length === 0 ? (
            <Empty title="Noch niemand" body="Teile dein Profil – dort steht der Knopf „Unterstützen“, sobald dein Abo eingeschaltet ist." />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {s.supporters.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-3">
                  <Avatar src={r.avatarUrl} name={r.displayName} size={36} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${r.handle}`} className="block truncate text-[14.5px] font-semibold hover:underline">
                      {r.displayName}
                    </Link>
                    <p className="text-[12.5px] text-muted">
                      seit {day(r.since)} · {formatMoney(r.priceMinor, r.currency)}/Monat · {r.provider === "apple" ? "iOS-App" : r.provider === "stripe" ? "Web" : "Test"}
                      {r.active && r.cancelAtPeriodEnd && r.currentPeriodEnd ? ` · bis ${day(r.currentPeriodEnd)}` : ""}
                    </p>
                  </div>
                  <Badge tone={r.active ? "moss" : "neutral"}>{r.active ? "Aktiv" : "Beendet"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
