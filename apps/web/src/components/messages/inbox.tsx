import Link from "next/link";
import { PenSquare, ShieldAlert } from "lucide-react";
import type { ConversationListItem, InboxBox } from "@/server/messaging/service";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export const BOX_PARAM: Record<InboxBox, string | null> = { inbox: null, requests: "anfragen", archived: "archiv" };
export function boxFromParam(p?: string): InboxBox {
  return p === "anfragen" ? "requests" : p === "archiv" ? "archived" : "inbox";
}

function stamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const diff = (now.getTime() - d.getTime()) / 86400_000;
  if (diff < 2 && new Date(now.getTime() - 86400_000).toDateString() === d.toDateString()) return "Gestern";
  if (diff < 7) return d.toLocaleDateString("de-CH", { weekday: "short" });
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: diff > 300 ? "2-digit" : undefined });
}

/** Unterhaltungsliste mit Ordnern (Posteingang / Anfragen / Archiv) und Ungelesen-Status. */
export function InboxPane({ box, items, activeId, counts, className }: { box: InboxBox; items: ConversationListItem[]; activeId?: string; counts: { requests: number; unread: number }; className?: string }) {
  const q = (b: InboxBox) => (BOX_PARAM[b] ? `?ordner=${BOX_PARAM[b]}` : "");
  const tabs: { key: InboxBox; label: string; count?: number }[] = [
    { key: "inbox", label: "Posteingang", count: counts.unread || undefined },
    { key: "requests", label: "Anfragen", count: counts.requests || undefined },
    { key: "archived", label: "Archiv" },
  ];
  return (
    <aside aria-label="Unterhaltungen" className={cn("flex min-h-0 flex-col border-line md:border-r", className)}>
      <div className="flex items-end justify-between gap-3 px-4 pb-3 pt-5 sm:px-5">
        <div>
          <p className="spec">Nachrichten</p>
          <h1 className="display mt-1 text-3xl">Gespräche</h1>
        </div>
        <Link href="/nachrichten/neu" className="grid size-10 place-items-center border border-line-strong hover:border-ink rounded-xl" aria-label="Neue Nachricht">
          <PenSquare size={17} />
        </Link>
      </div>
      <nav aria-label="Ordner" className="flex gap-5 border-b border-line px-4 sm:px-5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/nachrichten${q(t.key)}`}
            aria-current={box === t.key ? "page" : undefined}
            className={cn("relative -mb-px flex items-center gap-1.5 border-b-2 border-transparent py-2.5 text-[13px] text-muted hover:text-ink", box === t.key && "border-ink font-semibold text-ink")}
          >
            {t.label}
            {t.count != null && <span className={cn("min-w-4 px-1 text-center font-mono text-[10px]", t.key === "requests" ? "bg-clay text-paper" : "bg-ink text-paper")}>{t.count}</span>}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="headline text-lg">{box === "requests" ? "Keine Anfragen" : box === "archived" ? "Archiv ist leer" : "Noch keine Nachrichten"}</p>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
              {box === "requests" ? "Nachrichten von Personen, denen du nicht folgst, landen zuerst hier." : box === "archived" ? "Archivierte Gespräche kehren zurück, sobald jemand antwortet." : "Schreib jemandem aus der Community oder frag eine:n Verkäufer:in zu einem Produkt."}
            </p>
          </div>
        ) : (
          <ul>
            {items.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id}>
                  <Link
                    href={`/nachrichten/${c.id}${q(box)}`}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex gap-3 border-b border-line px-4 py-3.5 sm:px-5", active ? "bg-ink text-paper" : "hover:bg-card")}
                  >
                    <span className="relative shrink-0">
                      <Avatar src={c.other.avatarUrl} name={c.other.displayName} size={42} />
                      {c.unread && <span className={cn("absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 bg-clay", active ? "border-ink" : "border-paper")} aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-[14.5px]", c.unread ? "font-bold" : "font-semibold")}>{c.other.displayName}</span>
                        <time dateTime={c.lastMessageAt} className={cn("shrink-0 font-mono text-[10px] num", active ? "text-paper/70" : c.unread ? "text-ink" : "text-muted")}>{stamp(c.lastMessageAt)}</time>
                      </span>
                      {(c.orderNumber || c.isProductInquiry) && (
                        <span className={cn("spec block", active ? "text-paper/70" : "text-clay-ink")}>{c.orderNumber ? `Bestellung ${c.orderNumber}` : "Produktanfrage"}</span>
                      )}
                      <span className={cn("mt-0.5 flex items-center gap-1.5 text-[13px]", active ? "text-paper/80" : c.unread ? "text-ink" : "text-muted")}>
                        {c.flagged && <ShieldAlert size={13} className={active ? "text-paper" : "text-warn"} aria-label="Warnhinweis" />}
                        <span className="truncate">{c.lastFromMe && "Du: "}{c.preview}</span>
                      </span>
                      {c.unread && <span className="sr-only">Ungelesen</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted sm:px-5">
        Nachrichten sind nur für euch sichtbar und werden verschlüsselt übertragen, aber nicht Ende-zu-Ende verschlüsselt. Bei einer Meldung kann die Moderation sie einsehen.
      </p>
    </aside>
  );
}
