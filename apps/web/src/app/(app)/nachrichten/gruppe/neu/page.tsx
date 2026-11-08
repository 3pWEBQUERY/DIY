import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { groupCandidates } from "@/server/messaging/groups";
import { inboxCounts, listConversations } from "@/server/messaging/service";
import { InboxPane } from "@/components/messages/inbox";
import { NewGroupForm } from "@/components/messages/new-group";
import { FeatureGate } from "@/components/feature/feature-gate";

export const metadata: Metadata = { title: "Neue Gruppe", robots: { index: false } };

export default async function NewGroupPage() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/nachrichten/gruppe/neu");
  const [items, counts, candidates] = await Promise.all([listConversations(user.id, "inbox"), inboxCounts(user.id), groupCandidates(user)]);
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] md:h-dvh">
      <InboxPane box="inbox" items={items} counts={counts} className="hidden w-[340px] shrink-0 md:flex lg:w-[380px]" />
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg px-4 py-8">
          <Link href="/nachrichten" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink md:hidden">
            <ArrowLeft size={14} aria-hidden /> Nachrichten
          </Link>
          <p className="spec">Nachrichten · Gruppe</p>
          <h2 className="headline mt-2 text-2xl">Neue Gruppe</h2>
          <p className="mt-2 text-sm text-muted">Für Werkstatt-Runden, gemeinsame Projekte oder eure Strickgruppe – bis zu 25 Personen.</p>
          <div className="mt-8">
            <FeatureGate flag="messages.new" back={{ href: "/nachrichten", label: "Zu deinen Nachrichten" }}>
              <NewGroupForm candidates={candidates} />
            </FeatureGate>
          </div>
        </div>
      </div>
    </div>
  );
}
