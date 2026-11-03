import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { ProjectPageView } from "@/server/projects/service";
import { Avatar } from "@/components/ui/misc";
import { cn, formatDate, formatMinutes, pad } from "@/lib/utils";

/**
 * Projektfaden (USP, PRD §1.3 / §10.4): eine durchgehende Linie, auf der alle
 * Verknüpfungen eines Projekts als Knoten sitzen –
 * Idee → Journal → (Abschluss) → Anleitung → Produkte → Artikel → Nachbauten.
 *
 * Knoten-Grammatik:
 *  ▢ hohl  = Anfang / noch offen      ■ Tinte = Station
 *  ■ Moos  = Wissen & Abschluss        ■ Terrakotta = Community & Markt
 *  ◆ Terrakotta = Meilenstein          ┆ gestrichelt = Faden läuft weiter
 */

type Marker = "hollow" | "ink" | "moss" | "clay" | "diamond" | "dot" | "ghost";

const markerClass: Record<Marker, string> = {
  hollow: "size-[11px] border border-ink bg-paper",
  ink: "size-[11px] bg-ink",
  moss: "size-[11px] bg-moss",
  clay: "size-[11px] bg-clay",
  diamond: "size-[8px] rotate-45 bg-clay",
  dot: "size-[7px] rounded-full border border-ink bg-paper",
  ghost: "size-[11px] border border-dashed border-muted bg-paper",
};

function Node({ marker, small }: { marker: Marker; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("absolute top-[3px] -translate-x-1/2", small ? "left-[5.5px]" : "left-[5.5px]", markerClass[marker])}
    />
  );
}

type Station = {
  key: string;
  n: number;
  name: string;
  marker: Marker;
  anchor?: string;
  meta?: string;
  ghost?: boolean;
  children: ReactNode;
};

const short = (iso: string) => formatDate(iso, { day: "numeric", month: "short" });

function Child({ marker, label, children, href }: { marker: Marker; label: string; children: ReactNode; href?: string }) {
  const inner = (
    <>
      <span className="spec block">{label}</span>
      <span className={cn("block text-[14px] leading-snug text-ink-2", href && "group-hover:text-ink group-hover:underline decoration-1 underline-offset-2")}>{children}</span>
    </>
  );
  return (
    <li className="relative pl-7">
      <Node marker={marker} small />
      {href ? (
        <Link href={href} className="group block">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}

export function ProjectThread({ project: p, variant = "aside", className }: { project: ProjectPageView; variant?: "aside" | "inline"; className?: string }) {
  const owner = p.viewer.isOwner;
  const stations: Station[] = [];
  let n = 0;
  const next = () => ++n;

  // 01 Idee – Anfang des Fadens
  stations.push({
    key: "idea",
    n: next(),
    name: "Idee",
    marker: "hollow",
    anchor: "beschreibung",
    meta: formatDate(p.publishedAt, { day: "numeric", month: "short", year: "numeric" }),
    children: (
      <ul className="mt-2 space-y-2.5">
        <Child marker="dot" label="Begonnen">
          {p.title}
        </Child>
        {p.remixOf && (
          <Child marker="diamond" label="Nachbau von" href={p.remixOf.href}>
            «{p.remixOf.title}» von {p.remixOf.ownerName}
          </Child>
        )}
        {p.remixOfUnavailable && (
          <Child marker="dot" label="Nachbau von">
            Original nicht mehr verfügbar
          </Child>
        )}
      </ul>
    ),
  });

  // 02 Journal
  const entries = p.journal;
  if (entries.length || owner) {
    const shown = entries.length > 6 ? [...entries.slice(0, 2), null, ...entries.slice(-3)] : entries;
    const hiddenCount = entries.length > 6 ? entries.length - 5 : 0;
    stations.push({
      key: "journal",
      n: next(),
      name: "Journal",
      marker: entries.length ? "ink" : "ghost",
      ghost: !entries.length,
      anchor: "journal",
      meta: entries.length ? `${entries.length} ${entries.length === 1 ? "Eintrag" : "Einträge"}${p.journalMinutes ? ` · ${formatMinutes(p.journalMinutes)}` : ""}` : undefined,
      children: entries.length ? (
        <ul className="mt-2 space-y-2.5">
          {shown.map((e, i) =>
            e ? (
              <Child key={e.id} marker={e.milestone ? "diamond" : "dot"} label={`${pad(entries.indexOf(e) + 1)} · ${short(e.happenedAt)}`} href={`#eintrag-${e.id}`}>
                {e.milestone ?? (e.body.length > 70 ? `${e.body.slice(0, 68).trimEnd()} …` : e.body)}
              </Child>
            ) : (
              <li key={`gap-${i}`} className="relative pl-7">
                <span aria-hidden className="absolute left-[5.5px] top-0 h-full -translate-x-1/2 border-l border-dashed border-paper" />
                <a href="#journal" className="spec hover:text-ink">… {hiddenCount} weitere Einträge</a>
              </li>
            ),
          )}
          {p.posts.length > 0 && (
            <Child marker="dot" label="Im Feed" href="#beitraege">
              {p.posts.length} {p.posts.length === 1 ? "Beitrag" : "Beiträge"} zu diesem Projekt
            </Child>
          )}
        </ul>
      ) : (
        <p className="mt-1.5 text-[13px] text-muted">
          Dokumentiere den ersten Arbeitsschritt.{" "}
          <a href="#fortschritt" className="font-semibold text-ink underline underline-offset-2">Fortschritt eintragen</a>
        </p>
      ),
    });
  }

  // Abschluss
  if (p.completedAt) {
    stations.push({
      key: "done",
      n: next(),
      name: "Abgeschlossen",
      marker: "moss",
      meta: formatDate(p.completedAt, { day: "numeric", month: "short", year: "numeric" }),
      children: (
        <p className="mt-1.5 text-[13px] text-muted">
          {p.actualMinutes ? `Tatsächliche Arbeitszeit ${formatMinutes(p.actualMinutes)}` : "Fertig gebaut."}
        </p>
      ),
    });
  }

  // Anleitung
  if (p.tutorials.length || owner) {
    stations.push({
      key: "tutorial",
      n: next(),
      name: "Anleitung",
      marker: p.tutorials.length ? "moss" : "ghost",
      ghost: !p.tutorials.length,
      anchor: "anleitung",
      children: p.tutorials.length ? (
        <ul className="mt-2 space-y-2.5">
          {p.tutorials.map((t) => (
            <Child key={t.id} marker="dot" label={t.state === "PUBLISHED" ? `v${t.version ?? 1} · ${t.steps} Schritte` : "Entwurf"} href={`/anleitungen/${t.slug}`}>
              {t.title}
            </Child>
          ))}
        </ul>
      ) : (
        <GhostCta href={`/studio/anleitungen/neu?projekt=${p.id}`}>Anleitung schreiben</GhostCta>
      ),
    });
  }

  // Produkte
  if (p.products.length || owner) {
    stations.push({
      key: "products",
      n: next(),
      name: "Produkte",
      marker: p.products.length ? "clay" : "ghost",
      ghost: !p.products.length,
      anchor: "produkte",
      meta: p.products.length ? `${p.products.length} im Marktplatz` : undefined,
      children: p.products.length ? (
        <ul className="mt-2 space-y-2.5">
          {p.products.slice(0, 3).map((pr) => (
            <Child key={pr.id} marker="dot" label={pr.shopName} href={pr.href}>
              {pr.title}
            </Child>
          ))}
        </ul>
      ) : (
        <GhostCta href={`/studio/produkte/neu?projekt=${p.id}`}>Als Produkt anbieten</GhostCta>
      ),
    });
  }

  // Artikel
  if (p.articles.length) {
    stations.push({
      key: "articles",
      n: next(),
      name: "Artikel",
      marker: "ink",
      anchor: "artikel",
      children: (
        <ul className="mt-2 space-y-2.5">
          {p.articles.slice(0, 3).map((a) => (
            <Child key={a.id} marker="dot" label={`${a.readingMinutes} Min. Lesezeit`} href={a.href}>
              {a.title}
            </Child>
          ))}
        </ul>
      ),
    });
  }

  // Nachbauten
  stations.push({
    key: "remixes",
    n: next(),
    name: "Nachbauten",
    marker: p.remixes.length ? "clay" : "ghost",
    ghost: !p.remixes.length,
    anchor: "nachbauten",
    meta: p.remixes.length ? `${p.counts.remixes}×` : undefined,
    children: p.remixes.length ? (
      <a href="#nachbauten" className="group mt-2 flex items-center gap-3">
        <span className="flex -space-x-1.5">
          {p.remixes.slice(0, 5).map((r) => (
            <Avatar key={r.id} src={r.owner.avatarUrl} name={r.owner.displayName} size={24} ring />
          ))}
        </span>
        <span className="text-[13px] text-ink-2 group-hover:underline">
          {p.counts.remixes === 1 ? "1 Person hat es nachgebaut" : `${p.counts.remixes} Personen haben es nachgebaut`}
        </span>
      </a>
    ) : owner ? (
      <p className="mt-1.5 text-[13px] text-muted">Noch keine Nachbauten. Teile dein Projekt, um andere zu inspirieren.</p>
    ) : (
      <GhostCta href={`/projekte/neu?nachbau=${p.id}`}>Mach den ersten Nachbau</GhostCta>
    ),
  });

  const finished = !!p.completedAt;

  return (
    <nav aria-label="Projektfaden" className={cn(variant === "inline" && "border border-line bg-card p-5", className)}>
      <div className="mb-5 flex items-baseline justify-between gap-3 border-b border-ink pb-2.5">
        <h2 className="flex items-baseline gap-2.5 text-[15px] font-bold tracking-tight">
          <span className="spec text-ink">Faden</span>
          Projektfaden
        </h2>
        <span className="spec">{stations.filter((s) => !s.ghost).length} Stationen</span>
      </div>
      <ol className="relative">
        {stations.map((s, i) => {
          const last = i === stations.length - 1;
          const nextGhost = stations[i + 1]?.ghost;
          return (
            <li key={s.key} className={cn("relative pb-7 pl-7", last && "pb-2")}>
              {/* Liniensegment bis zur nächsten Station */}
              {!last && (
                <span
                  aria-hidden
                  className={cn("absolute left-[5.5px] top-[7px] h-full -translate-x-1/2", nextGhost || s.ghost ? "border-l border-dashed border-muted" : "w-px bg-ink")}
                />
              )}
              <Node marker={s.marker} />
              <div className="flex items-baseline justify-between gap-3">
                {s.anchor && !s.ghost ? (
                  <a href={`#${s.anchor}`} className="group flex items-baseline gap-2">
                    <span className="font-mono text-[11px] text-muted num">{pad(s.n)}</span>
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink group-hover:underline">{s.name}</span>
                  </a>
                ) : (
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] text-muted num">{pad(s.n)}</span>
                    <span className={cn("font-mono text-[11px] font-semibold uppercase tracking-[0.1em]", s.ghost ? "text-muted" : "text-ink")}>{s.name}</span>
                  </span>
                )}
                {s.meta && <span className="spec shrink-0">{s.meta}</span>}
              </div>
              {s.children}
            </li>
          );
        })}
      </ol>
      {/* Fadenende: Masslinien-Abschluss oder offener Faden */}
      <div className="mt-1 flex items-center gap-2 pl-0.5" aria-hidden>
        {finished ? <span className="h-px w-3 bg-ink" /> : <span className="h-3 border-l border-dashed border-muted" />}
        <span className="spec">{finished ? "Faden abgeschlossen" : "Faden läuft weiter"}</span>
      </div>
    </nav>
  );
}

function GhostCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
      {children}
      <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
