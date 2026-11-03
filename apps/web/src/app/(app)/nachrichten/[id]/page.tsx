import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getThread, inboxCounts, listConversations } from "@/server/messaging/service";
import { InboxPane, boxFromParam } from "@/components/messages/inbox";
import { ThreadView } from "@/components/messages/thread-view";

export const metadata: Metadata = { title: "Nachrichten", robots: { index: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ordner?: string }> };

export default async function ThreadPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await currentUser();
  if (!user?.profile) redirect(`/anmelden?weiter=/nachrichten/${id}`);
  const thread = await getThread(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!thread) notFound();
  const box = thread.me.isRequest ? "requests" : thread.me.archived ? "archived" : boxFromParam(sp.ordner);
  const [items, counts] = await Promise.all([listConversations(user.id, box), inboxCounts(user.id)]);
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] md:h-dvh">
      <InboxPane box={box} items={items} counts={counts} activeId={id} className="hidden w-[340px] shrink-0 md:flex lg:w-[380px]" />
      <div className="min-w-0 flex-1">
        <ThreadView key={thread.id} thread={thread} box={box} />
      </div>
    </div>
  );
}
