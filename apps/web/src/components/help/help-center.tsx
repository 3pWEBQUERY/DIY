"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, X } from "lucide-react";
import type { HelpIcon as HelpIconName } from "@/lib/help/content";
import { searchHelp, normalizeHelp, type HelpIndexEntry } from "@/lib/help/search";
import { HelpIcon } from "./help-icon";

export type HelpCategoryCard = { id: string; title: string; icon: HelpIconName; summary: string; count: number };

/** Ausschnitt der Antwort rund um den ersten Treffer */
function snippet(text: string, query: string) {
  const first = normalizeHelp(query).split(" ")[0] ?? "";
  const plain = text;
  const at = first ? normalizeHelp(plain).indexOf(first) : -1;
  // Die normalisierte Fassung ist höchstens kürzer – die Position reicht als Näherung
  const start = at > 60 ? Math.max(0, at - 60) : 0;
  const cut = plain.slice(start, start + 170);
  return `${start > 0 ? "… " : ""}${cut}${start + 170 < plain.length ? " …" : ""}`;
}

/**
 * Startseite des Hilfe-Centers: Suche über alle Antworten (im Browser, ohne Serveranfrage) und
 * Bereiche als Kacheln. Alte Anker (/hilfe#kaufen) führen auf die neue Bereichsseite.
 */
export function HelpCenter({ categories, index, initialQuery = "", suffix = "" }: { categories: HelpCategoryCard[]; index: HelpIndexEntry[]; initialQuery?: string; suffix?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchHelp(index, query), [index, query]);
  const searching = query.trim().length > 0;

  // Frühere Ankerlinks (/hilfe#kaufen, /hilfe#verkaufen …) auf die Bereichsseite umleiten
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && categories.some((c) => c.id === id)) router.replace(`/hilfe/${id}${suffix}`);
  }, [categories, router, suffix]);

  // Suchbegriff in der Adresse halten (teilbar, Zurück-Taste)
  useEffect(() => {
    const t = setTimeout(() => {
      const url = new URL(location.href);
      if (query.trim()) url.searchParams.set("q", query.trim());
      else url.searchParams.delete("q");
      history.replaceState(history.state, "", url);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="max-w-2xl">
        <label htmlFor={inputId} className="spec mb-2 block">
          Hilfe durchsuchen
        </label>
        <div className="flex items-stretch overflow-hidden rounded-2xl border border-rule bg-card transition-colors focus-within:border-moss focus-within:ring-4 focus-within:ring-moss/12">
          <Search size={18} className="ml-4 self-center text-muted" aria-hidden />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="z. B. Gutschein, Rückgabe, Zwei-Faktor, Euro …"
            autoComplete="off"
            className="h-13 min-w-0 flex-1 bg-transparent px-3 text-[16px] outline-none placeholder:text-muted"
            aria-describedby={`${inputId}-status`}
          />
          {searching && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="grid w-12 place-items-center text-muted hover:text-ink"
              aria-label="Suche leeren"
            >
              <X size={17} aria-hidden />
            </button>
          )}
        </div>
        <p id={`${inputId}-status`} role="status" aria-live="polite" className="mt-2 min-h-5 text-[13px] text-muted">
          {searching ? (results.length ? `${results.length} ${results.length === 1 ? "Antwort" : "Antworten"} gefunden` : "Keine Antwort gefunden") : ""}
        </p>
      </form>

      {searching ? (
        results.length ? (
          <ol className="mt-4 divide-y divide-line border-y border-line">
            {results.map((r) => (
              <li key={`${r.categoryId}-${r.id}`}>
                <Link href={`/hilfe/${r.categoryId}${suffix}#${r.id}`} className="group block py-4 hover:bg-sunken/60 sm:px-3 sm:-mx-3 rounded-xl">
                  <span className="spec block text-muted">{r.categoryTitle}</span>
                  <span className="mt-1 flex items-start justify-between gap-4 text-[16px] font-semibold text-ink group-hover:text-moss-ink">
                    {r.q}
                    <ArrowRight size={16} aria-hidden className="mt-1 shrink-0 text-muted" />
                  </span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-ink-2">{snippet(r.text, query)}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-line-strong p-6 text-[15px] text-ink-2">
            <p className="font-semibold text-ink">Dazu haben wir noch keine Antwort.</p>
            <p className="mt-1">Versuche ein anderes Wort oder wähle unten einen Bereich – oder schreib uns, ein Mensch antwortet.</p>
            <Link href="/kontakt" className="mt-3 inline-block font-semibold text-moss underline underline-offset-2">
              Support kontaktieren
            </Link>
          </div>
        )
      ) : null}

      <section aria-labelledby="bereiche-t" className={searching ? "mt-14" : "mt-6"}>
        <h2 id="bereiche-t" className="spec mb-4 text-ink">
          Alle Bereiche
        </h2>
        <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.id} className="bg-paper">
              <Link href={`/hilfe/${c.id}${suffix}`} className="group flex h-full gap-4 p-5 hover:bg-sunken">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-moss-soft text-moss-ink">
                  <HelpIcon name={c.icon} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[15.5px] font-semibold text-ink group-hover:text-moss-ink">
                    {c.title}
                  </span>
                  <span className="mt-1 block text-[13.5px] leading-snug text-muted">{c.summary}</span>
                  <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    {c.count} {c.count === 1 ? "Antwort" : "Antworten"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
