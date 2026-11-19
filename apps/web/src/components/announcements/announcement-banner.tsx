"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { ANNOUNCEMENT_TONES } from "@werkraum/shared";
import { FormattedText } from "@/components/ui/formatted-text";
import { EMOJI_FONT } from "@/components/ui/emoji-picker";
import { cn } from "@/lib/utils";
import type { AnnouncementView } from "@/server/announcements/service";

const HIDDEN_KEY = "wr-announcements-hidden";
const keyOf = (a: Pick<AnnouncementView, "id" | "version">) => `${a.id}:${a.version}`;

function readHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Darstellung einer Ankündigung (auch Vorschau im Admin-Bereich) */
export function AnnouncementCard({ a, onDismiss, className }: { a: Omit<AnnouncementView, "id" | "version">; onDismiss?: () => void; className?: string }) {
  const tone = ANNOUNCEMENT_TONES[a.tone];
  const external = /^https:/i.test(a.ctaHref);
  return (
    <section
      aria-label={`Ankündigung: ${a.title}`}
      className={cn("relative rounded-2xl bg-[var(--ann-bg)] px-5 py-5 text-[var(--ann-fg)] sm:px-7 sm:py-6", className)}
      style={{ "--ann-bg": tone.bg, "--ann-fg": tone.fg } as React.CSSProperties}
    >
      <div className={cn("flex items-start gap-4 sm:gap-5", a.dismissible && onDismiss && "pr-9")}>
        {a.emoji && (
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--ann-fg)_14%,transparent)] text-[28px] leading-none sm:size-14 sm:text-[32px]"
            style={{ fontFamily: EMOJI_FONT }}
          >
            {a.emoji}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="headline text-[1.3rem] leading-tight text-balance sm:text-[1.55rem]">{a.title}</h2>
          {a.body && <FormattedText text={a.body} className="mt-2 max-w-[62ch] text-[15px] leading-relaxed [&_a]:!text-current [&_a]:!decoration-current [&_strong]:!text-current [&_li]:marker:!text-current" />}
          {a.ctaLabel && a.ctaHref && (
            <Link
              href={a.ctaHref}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--ann-fg)] px-4 text-[14px] font-semibold text-[var(--ann-bg)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ann-fg)]"
            >
              {a.ctaLabel} <ArrowRight size={15} aria-hidden />
            </Link>
          )}
        </div>
      </div>
      {a.dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Ankündigung ausblenden"
          className="absolute right-2.5 top-2.5 grid size-9 place-items-center rounded-full transition-colors hover:bg-[color-mix(in_srgb,var(--ann-fg)_14%,transparent)] focus-visible:outline-2 focus-visible:outline-[var(--ann-fg)]"
        >
          <X size={18} aria-hidden />
        </button>
      )}
    </section>
  );
}

/**
 * Mini-Hero oben auf einer Seite: die wichtigste laufende Ankündigung, die die Person nicht
 * ausgeblendet hat. „Ausblenden“ merkt sich der Browser – nach einer Änderung erscheint sie wieder.
 */
export function AnnouncementBanner({ items, className }: { items: AnnouncementView[]; className?: string }) {
  const [hidden, setHidden] = useState<string[] | null>(null);
  useEffect(() => setHidden(readHidden()), []);
  const current = items.find((a) => !(hidden ?? []).includes(keyOf(a)));
  if (!current) return null;
  const dismiss = () => {
    const next = [...readHidden().filter((k) => !k.startsWith(`${current.id}:`)), keyOf(current)].slice(-50);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      /* ohne Speicher: nur für diesen Besuch */
    }
    setHidden(next);
  };
  return <AnnouncementCard a={current} onDismiss={dismiss} className={className} />;
}
