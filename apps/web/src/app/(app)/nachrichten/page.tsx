import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PenSquare } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { inboxCounts, listConversations } from "@/server/messaging/service";
import { InboxPane, boxFromParam } from "@/components/messages/inbox";
import { AutoRefresh } from "@/components/messages/auto-refresh";

export const metadata: Metadata = { title: "Nachrichten", robots: { index: false } };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ ordner?: string }> }) {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/nachrichten");
  const box = boxFromParam((await searchParams).ordner);
  const [items, counts] = await Promise.all([listConversations(user.id, box), inboxCounts(user.id)]);
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] md:h-dvh">
      <AutoRefresh />
      <InboxPane box={box} items={items} counts={counts} className="w-full shrink-0 md:w-[340px] lg:w-[380px]" />
      <div className="hidden min-w-0 flex-1 items-center justify-center p-10 md:flex">
        <div className="max-w-sm text-center">
          <svg aria-hidden width="120" height="48" viewBox="0 0 120 48" className="mx-auto text-line-strong">
            <path d="M4 34c14-24 28-24 42 0s28 24 42 0 18-18 28-8" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="4" cy="34" r="2.5" fill="currentColor" />
            <circle cx="116" cy="26" r="2.5" fill="currentColor" />
          </svg>
          <p className="headline mt-6 text-2xl">Wähle ein Gespräch</p>
          <p className="mt-2 text-sm text-muted">Oder beginne ein neues – mit einer Person aus der Community oder zu einer Bestellung.</p>
          <Link href="/nachrichten/neu" className="mt-6 inline-flex h-10 items-center gap-2 border border-ink px-4 text-sm font-semibold hover:bg-ink hover:text-paper rounded-xl">
            <PenSquare size={15} /> Neue Nachricht
          </Link>
        </div>
      </div>
    </div>
  );
}
