"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Bell,
  BookOpen,
  CornerDownRight,
  GitFork,
  Heart,
  KeyRound,
  Layers,
  Mail,
  MessageCircle,
  Package,
  PenLine,
  Shield,
  ShoppingBag,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NotificationView } from "@/server/notifications-inbox";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { loadNotificationsAction, markReadAction } from "@/app/(app)/benachrichtigungen/actions";
import { refreshCounts } from "@/components/shell/live-counts";

const ICONS: Record<string, LucideIcon> = {
  "user-plus": UserPlus,
  "message-circle": MessageCircle,
  "corner-down-right": CornerDownRight,
  "at-sign": AtSign,
  heart: Heart,
  layers: Layers,
  "git-fork": GitFork,
  "pen-line": PenLine,
  mail: Mail,
  "shopping-bag": ShoppingBag,
  package: Package,
  shield: Shield,
  users: Users,
  "book-open": BookOpen,
  "key-round": KeyRound,
  bell: Bell,
};

/** Schweizer Zeitzone für stabile Tagesgruppen (Server und Client rendern identisch). */
const TZ = "Europe/Zurich";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("de-CH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("de-CH", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

function dayLabel(key: string, todayKey: string, yesterdayKey: string, sample: Date) {
  if (key === todayKey) return "Heute";
  if (key === yesterdayKey) return "Gestern";
  return dayFmt.format(sample);
}

export function NotificationList({ initial, cursor: initialCursor, filter, now }: { initial: NotificationView[]; cursor: string | null; filter: string; now: string }) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, start] = useTransition();
  const router = useRouter();

  const nowD = new Date(now);
  const todayKey = dayKeyFmt.format(nowD);
  const yesterdayKey = dayKeyFmt.format(new Date(nowD.getTime() - 86_400_000));

  const groups: { key: string; label: string; items: NotificationView[] }[] = [];
  for (const n of items) {
    const d = new Date(n.updatedAt);
    const key = dayKeyFmt.format(d);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: dayLabel(key, todayKey, yesterdayKey, d), items: [] };
      groups.push(g);
    }
    g.items.push(n);
  }

  async function open(n: NotificationView) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await markReadAction([n.id]);
      refreshCounts();
    }
    router.push(n.href);
  }

  function loadMore() {
    if (!cursor) return;
    start(async () => {
      const r = await loadNotificationsAction(filter, cursor);
      if (!r.ok) return toast(r.error, "error");
      setItems((prev) => [...prev, ...r.data.items.filter((x) => !prev.some((p) => p.id === x.id))]);
      setCursor(r.data.nextCursor);
    });
  }

  return (
    <div>
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`d-${g.key}`} className="mt-8 first:mt-6">
          <h2 id={`d-${g.key}`} className="spec mb-1 flex items-center gap-3 text-ink">
            {g.label}
            <span className="h-px flex-1 bg-line" aria-hidden />
          </h2>
          <ul>
            {g.items.map((n) => {
              const Icon = ICONS[n.icon] ?? Bell;
              return (
                <li key={n.id} className="border-b border-line">
                  <Link
                    href={n.href}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      void open(n);
                    }}
                    className={cn(
                      "group relative flex gap-3.5 py-3.5 pl-4 pr-2 transition-colors hover:bg-sunken focus-visible:bg-sunken rounded-2xl",
                      !n.read && "bg-card before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-clay",
                    )}
                  >
                    <span className="relative mt-0.5 shrink-0">
                      {n.actor ? (
                        <Avatar src={n.actor.avatarUrl} name={n.actor.displayName} size={36} />
                      ) : (
                        <span className={cn("grid size-9 place-items-center border rounded-xl", n.group === "system" ? "border-moss bg-moss text-paper" : "border-line-strong bg-paper text-ink")}>
                          <Icon size={16} strokeWidth={1.7} aria-hidden />
                        </span>
                      )}
                      {n.actor && (
                        <span className="absolute -bottom-1 -right-1 grid size-[18px] place-items-center border border-paper bg-ink text-paper rounded-xl">
                          <Icon size={10} strokeWidth={2} aria-hidden />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[14.5px] leading-snug", n.read ? "text-ink-2" : "text-ink")}>
                        {n.lead && <strong className="font-semibold text-ink">{n.lead} </strong>}
                        {n.body}
                      </span>
                      {n.excerpt && <span className="mt-1 line-clamp-2 block border-l border-line-strong pl-2.5 font-serif text-[14.5px] text-muted">{n.excerpt}</span>}
                      <span className="spec mt-1.5 block">
                        {timeFmt.format(new Date(n.updatedAt))}
                        {n.count > 1 && ` · ${n.count} Ereignisse`}
                        {!n.read && <span className="sr-only"> · ungelesen</span>}
                      </span>
                    </span>
                    {!n.read && <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-clay" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {cursor && (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loading} aria-busy={loading}>
            {loading ? "Lädt …" : "Ältere laden"}
          </Button>
        </div>
      )}
    </div>
  );
}
