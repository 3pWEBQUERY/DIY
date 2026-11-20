import Link from "next/link";
import { HASHTAG_SOURCE, hashtagHref, isHashtagToken } from "@werkraum/shared";

/**
 * Nutzertext mit klickbaren @Erwähnungen, #Hashtags und Links. Rendert nur React-Elemente,
 * nie HTML (XSS-sicher). Zeilenumbrüche bleiben über `whitespace-pre-line` am Container erhalten.
 *
 * - Handles enden nie auf Punkt/Unterstrich; Satzzeichen am Ende gehören weder zum Handle noch zur URL.
 * - Lookbehind: @ mitten in E-Mail-Adressen (info@werkuno.ch) ist keine Erwähnung,
 *   # mitten in Wörtern oder Links (seite#abschnitt) kein Hashtag.
 */
const MENTION = "(?<![a-z0-9._@])@[a-z0-9][a-z0-9._]{1,22}[a-z0-9]";
const URL = "https?:\\/\\/[^\\s]+?(?=[.,;:!?)\\]]*(?:\\s|$))";
const TOKENS = new RegExp(`(${MENTION}|${URL}|${HASHTAG_SOURCE})`, "giu");

export function Linkified({ text, links = true, mentions = true }: { text: string; links?: boolean; mentions?: boolean }) {
  const parts = text.split(TOKENS);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0 || !p) return p;
        if (p.startsWith("@")) {
          return mentions ? (
            <Link key={i} href={`/u/${p.slice(1).toLowerCase()}`} className="font-semibold text-moss hover:underline">
              {p}
            </Link>
          ) : (
            p
          );
        }
        if (p.startsWith("#")) {
          return isHashtagToken(p) ? <HashtagLink key={i} tag={p} /> : p;
        }
        return links ? (
          <a key={i} href={p} rel="nofollow noopener ugc" target="_blank" className="text-moss underline underline-offset-2 break-all">
            {p.replace(/^https?:\/\//, "").slice(0, 40)}
            {p.length > 48 ? "…" : ""}
          </a>
        ) : (
          p
        );
      })}
    </>
  );
}

/**
 * Hashtag als Link auf `/hashtag/…`. Innerhalb der App öffnet sich die Hashtag-Ansicht über der
 * aktuellen Seite (abgefangene Route), beim direkten Aufruf als eigene Seite.
 */
export function HashtagLink({ tag, className }: { tag: string; className?: string }) {
  const display = tag.startsWith("#") ? tag : `#${tag}`;
  return (
    <Link href={hashtagHref(tag)} scroll={false} className={className ?? "font-semibold text-moss hover:underline"}>
      {display}
    </Link>
  );
}
