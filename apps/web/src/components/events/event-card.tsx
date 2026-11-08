import Link from "next/link";
import { MapPin, Video, Users } from "lucide-react";
import { EVENT_KIND_LABEL } from "@werkraum/shared";
import type { EventCard as EventCardData } from "@/server/communities/events";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const TZ = "Europe/Zurich";
export const eventDay = (iso: string) => new Date(iso).toLocaleDateString("de-CH", { timeZone: TZ, day: "numeric" });
export const eventMonth = (iso: string) => new Date(iso).toLocaleDateString("de-CH", { timeZone: TZ, month: "short" }).replace(".", "");
export const eventTime = (iso: string) => new Date(iso).toLocaleTimeString("de-CH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const eventDate = (iso: string) => new Date(iso).toLocaleDateString("de-CH", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Datumsblatt (Tag + Monat) wie ein Abreisskalender. */
export function DateTile({ iso, className, muted }: { iso: string; className?: string; muted?: boolean }) {
  return (
    <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl border text-center leading-none", muted ? "border-line bg-sunken text-muted" : "border-moss/30 bg-moss-soft text-moss-ink", className)} aria-hidden>
      <span>
        <span className="block text-[20px] font-bold num">{eventDay(iso)}</span>
        <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em]">{eventMonth(iso)}</span>
      </span>
    </span>
  );
}

export function EventCard({ e, showCommunity = true }: { e: EventCardData; showCommunity?: boolean }) {
  const sameDay = eventDate(e.startsAt) === eventDate(e.endsAt);
  return (
    <Link href={e.href} className={cn("group flex gap-4 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-rule-strong", e.cancelled && "opacity-70")}>
      <DateTile iso={e.startsAt} muted={e.cancelled || e.past} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{EVENT_KIND_LABEL[e.kind as keyof typeof EVENT_KIND_LABEL] ?? e.kind}</Badge>
          {e.cancelled && <Badge tone="danger">Abgesagt</Badge>}
          {!e.cancelled && e.myStatus === "GOING" && <Badge tone="moss">Du bist dabei</Badge>}
          {!e.cancelled && e.myStatus === "INTERESTED" && <Badge>Interessiert</Badge>}
          {!e.cancelled && e.full && e.myStatus !== "GOING" && <Badge tone="warn">Ausgebucht</Badge>}
        </span>
        <span className={cn("mt-1.5 block font-semibold leading-snug group-hover:underline", e.cancelled && "line-through")}>{e.title}</span>
        <span className="mt-1 block text-[13px] text-muted">
          {eventDate(e.startsAt).replace(/ \d{4}$/, "")}, {eventTime(e.startsAt)}
          {sameDay ? `–${eventTime(e.endsAt)}` : ""}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
          <span className="inline-flex items-center gap-1">
            {e.mode === "ONLINE" ? <Video size={13} aria-hidden /> : <MapPin size={13} aria-hidden />}
            {e.mode === "ONLINE" ? "Online" : e.locationName || "Vor Ort"}
          </span>
          <span className="inline-flex items-center gap-1 num">
            <Users size={13} aria-hidden /> {e.goingCount}
            {e.capacity ? ` / ${e.capacity}` : ""} dabei
          </span>
          {showCommunity && <span className="text-muted">{e.community.name}</span>}
        </span>
      </span>
    </Link>
  );
}
