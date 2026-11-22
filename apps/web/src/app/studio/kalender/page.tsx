import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { isPro } from "@/server/pro/service";
import { CALENDAR_KIND_LABEL, contentCalendar, upcomingScheduled, type CalendarItem, type CalendarKind } from "@/server/pro/calendar";
import { ProMark } from "@/components/pro/pro-mark";
import { LinkButton } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/misc";
import { TZ, addDaysToDayKey, zurichDateTimeIso, zurichDayKey } from "@/lib/tz";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inhaltskalender" };
export const dynamic = "force-dynamic";

const KIND_DOT: Record<CalendarKind, string> = {
  POST: "bg-ink",
  ARTICLE: "bg-muted",
  PROJECT: "bg-clay",
  TUTORIAL: "bg-moss",
  NEWSLETTER: "bg-warn",
};
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const time = new Intl.DateTimeFormat("de-CH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayLong = new Intl.DateTimeFormat("de-CH", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const monthLong = new Intl.DateTimeFormat("de-CH", { timeZone: "UTC", month: "long", year: "numeric" });
const when = new Intl.DateTimeFormat("de-CH", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** `?monat=2026-11` → erster Tag; sonst aktueller Monat (Zürich) */
function monthStart(raw: string | undefined) {
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  const key = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}-01` : `${zurichDayKey().slice(0, 7)}-01`;
  return key;
}
function shiftMonth(first: string, n: number) {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/**
 * Inhaltskalender (Creator Pro): geplante und veröffentlichte Beiträge, Artikel, Projekte, Anleitungen
 * und Newsletter auf einen Blick. Monatsraster am Bildschirm, Tagesliste auf schmalen Geräten.
 * Ohne Pro: die Liste der geplanten Beiträge und Artikel plus Hinweis.
 */
export default async function ContentCalendarPage({ searchParams }: { searchParams: Promise<{ monat?: string }> }) {
  const [user, sp] = await Promise.all([currentUser(), searchParams]);
  if (!user?.profile) redirect("/anmelden?weiter=/studio/kalender");
  const pro = await isPro(user.id);

  if (!pro) {
    const upcoming = await upcomingScheduled(user.id);
    return (
      <div className="max-w-[820px]">
        <Header />
        <section className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="headline text-2xl">Alles geplant im Blick</h2>
            <ProMark size="md" />
          </div>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
            Mit Creator Pro planst du auch Projekte und Anleitungen auf einen Zeitpunkt und siehst alle Veröffentlichungen im Monatskalender – Beiträge, Artikel, Projekte, Anleitungen und Newsletter.
          </p>
          <LinkButton href="/studio/pro" className="mt-5">Creator Pro ansehen</LinkButton>
        </section>
        <section className="mt-10" aria-labelledby="geplant">
          <SectionTitle n="01" title={<span id="geplant">Geplant</span>} />
          <UpcomingList items={upcoming} empty="Nichts geplant. Beiträge und Artikel kannst du beim Veröffentlichen auf später legen." />
        </section>
      </div>
    );
  }

  const first = monthStart(sp.monat);
  const nextFirst = `${shiftMonth(first, 1)}-01`;
  // Raster: Montag vor dem Monatsersten bis Sonntag nach dem Monatsende
  const firstDow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const gridStart = addDaysToDayKey(first, -firstDow);
  const lastDay = addDaysToDayKey(nextFirst, -1);
  const lastDow = (new Date(`${lastDay}T00:00:00Z`).getUTCDay() + 6) % 7;
  const gridEnd = addDaysToDayKey(lastDay, 6 - lastDow);
  const days: string[] = [];
  for (let d = gridStart; d && d <= gridEnd; d = addDaysToDayKey(d, 1)) days.push(d);

  const from = new Date(zurichDateTimeIso(gridStart) ?? `${gridStart}T00:00:00Z`);
  const to = new Date(zurichDateTimeIso(addDaysToDayKey(gridEnd, 1)) ?? `${gridEnd}T23:59:59Z`);
  const [items, upcoming] = await Promise.all([contentCalendar(user.id, from, to), upcomingScheduled(user.id)]);
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const k = zurichDayKey(new Date(it.at));
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }
  const today = zurichDayKey();
  const month = first.slice(0, 7);
  const monthItems = items.filter((i) => zurichDayKey(new Date(i.at)).startsWith(month));
  const monthDays = [...new Set(monthItems.map((i) => zurichDayKey(new Date(i.at))))].sort();

  return (
    <div className="max-w-[1100px]">
      <Header />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="headline mr-auto text-2xl capitalize">{monthLong.format(new Date(`${first}T12:00:00Z`))}</h2>
        <nav aria-label="Monat wechseln" className="flex items-center gap-1">
          <Link href={`/studio/kalender?monat=${shiftMonth(first, -1)}`} className="grid size-9 place-items-center rounded-full border border-line hover:border-ink-2" aria-label="Vorheriger Monat">
            <ChevronLeft size={16} />
          </Link>
          <Link href="/studio/kalender" className="h-9 rounded-full border border-line px-4 text-[13px] font-semibold leading-9 hover:border-ink-2">
            Heute
          </Link>
          <Link href={`/studio/kalender?monat=${shiftMonth(first, 1)}`} className="grid size-9 place-items-center rounded-full border border-line hover:border-ink-2" aria-label="Nächster Monat">
            <ChevronRight size={16} />
          </Link>
        </nav>
      </div>

      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted" aria-label="Legende">
        {(Object.keys(CALENDAR_KIND_LABEL) as CalendarKind[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", KIND_DOT[k])} aria-hidden />
            {CALENDAR_KIND_LABEL[k]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full border border-dashed border-ink-2" aria-hidden />
          gestrichelt = geplant
        </li>
      </ul>

      {/* Monatsraster (ab md) */}
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-card md:block">
        <div className="grid grid-cols-7 border-b border-line">
          {WEEKDAYS.map((w) => (
            <div key={w} className="spec px-2 py-2 text-center">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const list = byDay.get(d) ?? [];
            const inMonth = d.startsWith(month);
            return (
              <div key={d} className={cn("min-h-[112px] border-line p-1.5", i % 7 !== 6 && "border-r", i < days.length - 7 && "border-b", !inMonth && "bg-sunken/60")}>
                <p className={cn("mb-1 px-1 text-[12px] font-semibold num", !inMonth && "text-muted", d === today && "inline-flex size-6 items-center justify-center rounded-full bg-ink px-0 text-paper")}>
                  {Number(d.slice(8))}
                </p>
                <ul className="space-y-1">
                  {list.slice(0, 4).map((it) => (
                    <li key={`${it.kind}-${it.id}`}>
                      <ItemChip it={it} />
                    </li>
                  ))}
                  {list.length > 4 && <li className="px-1 text-[11px] text-muted">+ {list.length - 4} weitere</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tagesliste (schmal) */}
      <div className="md:hidden">
        {monthDays.length === 0 ? (
          <p className="rounded-2xl border border-line bg-card p-5 text-[14px] text-muted">In diesem Monat ist nichts geplant oder erschienen.</p>
        ) : (
          <ol className="space-y-5">
            {monthDays.map((d) => (
              <li key={d}>
                <p className={cn("spec mb-2", d === today && "text-ink")}>{dayLong.format(new Date(`${d}T12:00:00Z`))}</p>
                <ul className="space-y-1.5">
                  {(byDay.get(d) ?? []).map((it) => (
                    <li key={`${it.kind}-${it.id}`}>
                      <ItemChip it={it} large />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      <section className="mt-12" aria-labelledby="geplant">
        <SectionTitle n="01" title={<span id="geplant">Als Nächstes geplant</span>} />
        <UpcomingList items={upcoming} empty="Nichts geplant. Beim Veröffentlichen von Beiträgen, Artikeln, Projekten und Anleitungen kannst du einen Zeitpunkt wählen." />
      </section>
    </div>
  );
}

function Header() {
  return (
    <header className="mb-8">
      <p className="spec mb-3 flex items-center gap-2">
        <span className="inline-block h-px w-6 bg-rule-strong" />
        Studio
      </p>
      <h1 className="display flex items-center gap-3 text-[2.4rem] sm:text-5xl">Inhaltskalender</h1>
    </header>
  );
}

function ItemChip({ it, large = false }: { it: CalendarItem; large?: boolean }) {
  return (
    <Link
      href={it.href}
      className={cn(
        "flex items-start gap-1.5 rounded-lg border px-1.5 py-1 hover:border-ink-2",
        it.scheduled ? "border-dashed border-line-strong bg-card" : "border-line bg-paper",
        large && "px-3 py-2",
      )}
      title={`${CALENDAR_KIND_LABEL[it.kind]}${it.scheduled ? " (geplant)" : ""}: ${it.title}`}
    >
      <span className={cn("mt-[5px] size-1.5 shrink-0 rounded-full", KIND_DOT[it.kind])} aria-hidden />
      <span className="min-w-0">
        <span className={cn("block font-mono text-muted", large ? "text-[11.5px]" : "text-[10px]")}>
          {time.format(new Date(it.at))} · {CALENDAR_KIND_LABEL[it.kind]}
          {it.scheduled ? " · geplant" : ""}
        </span>
        <span className={cn("block truncate font-semibold", large ? "text-[14px]" : "text-[11.5px] leading-tight")}>{it.title}</span>
      </span>
    </Link>
  );
}

function UpcomingList({ items, empty }: { items: CalendarItem[]; empty: string }) {
  if (!items.length) return <p className="mt-3 text-[14px] text-muted">{empty}</p>;
  return (
    <ul className="mt-3 divide-y divide-line border-y border-line">
      {items.map((it) => (
        <li key={`${it.kind}-${it.id}`}>
          <Link href={it.href} className="flex items-center gap-3 py-3 hover:bg-sunken/50">
            <CalendarClock size={16} className="shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold">{it.title}</span>
              <span className="block text-[12.5px] text-muted">
                {CALENDAR_KIND_LABEL[it.kind]} · {when.format(new Date(it.at))}
              </span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
