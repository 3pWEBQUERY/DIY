import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { NOTIFICATION_FILTERS } from "@/server/notifications-format";
import { listNotifications, unreadByFilter } from "@/server/notifications-inbox";
import { Page, PageHeader, TabLinks } from "@/components/shell/page";
import { Empty } from "@/components/ui/misc";
import { NotificationList } from "@/components/notifications/notification-list";
import { MarkAllRead } from "./mark-all-read";

export const metadata: Metadata = { title: "Benachrichtigungen", robots: { index: false } };
export const dynamic = "force-dynamic";

const EMPTY: Record<string, { title: string; body: string }> = {
  all: { title: "Alles ruhig", body: "Wenn jemand auf deine Projekte reagiert, dir folgt oder dir schreibt, erfährst du es hier." },
  mentions: { title: "Keine Erwähnungen", body: "Kommentare, Antworten und Erwähnungen erscheinen hier." },
  projects: { title: "Noch keine Projektaktivität", body: "Gefällt-mir, Nachbauten und Updates zu Projekten und Anleitungen sammeln sich hier." },
  shop: { title: "Keine Shop-Meldungen", body: "Neue Bestellungen und Statusänderungen deiner Käufe erscheinen hier." },
  system: { title: "Keine Systemmeldungen", body: "Sicherheitshinweise und Moderationsentscheidungen erscheinen hier." },
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/benachrichtigungen");
  const filter = NOTIFICATION_FILTERS.find((f) => f.key === sp.filter)?.key ?? "all";
  const [page, unread] = await Promise.all([listNotifications(user.id, { filter, limit: 40 }), unreadByFilter(user.id)]);
  const empty = EMPTY[filter] ?? EMPTY.all!;

  return (
    <Page>
      <PageHeader
        kicker="Posteingang"
        title="Benachrichtigungen"
        actions={
          <>
            {(unread.all ?? 0) > 0 && <MarkAllRead />}
            <Link href="/einstellungen/benachrichtigungen" className="grid size-10 place-items-center border border-line-strong hover:border-ink rounded-xl" aria-label="Benachrichtigungen einstellen">
              <Settings size={16} aria-hidden />
            </Link>
          </>
        }
        description={(unread.all ?? 0) > 0 ? `${unread.all} ungelesen. Ähnliche Ereignisse werden gebündelt, damit dein Posteingang ruhig bleibt.` : "Ähnliche Ereignisse werden gebündelt, damit dein Posteingang ruhig bleibt."}
      />
      <TabLinks
        active={filter}
        tabs={NOTIFICATION_FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          href: f.key === "all" ? "/benachrichtigungen" : `/benachrichtigungen?filter=${f.key}`,
          count: unread[f.key] || undefined,
        }))}
      />
      {page.items.length ? (
        <NotificationList key={`${filter}:${unread.all ?? 0}`} initial={page.items} cursor={page.nextCursor} filter={filter} now={new Date().toISOString()} />
      ) : (
        <Empty className="mt-8" title={empty.title} body={empty.body} />
      )}
    </Page>
  );
}
