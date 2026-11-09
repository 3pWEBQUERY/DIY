import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { inboxCounts, listConversations, prepareConversation } from "@/server/messaging/service";
import { InboxPane } from "@/components/messages/inbox";
import { NewConversationComposer } from "@/components/messages/new-conversation";
import { Avatar, Notice } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Neue Nachricht", robots: { index: false } };

type SP = { an?: string; bestellung?: string; produkt?: string };

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const self = `/nachrichten/neu?${new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][])}`;
  if (!user?.profile) redirect(`/anmelden?weiter=${encodeURIComponent(self)}`);

  const handle = sp.an?.trim().replace(/^@/, "") ?? "";
  const prep = handle ? await prepareConversation(user, { handle, orderId: sp.bestellung, productId: sp.produkt }) : null;
  if (prep?.kind === "existing") redirect(`/nachrichten/${prep.conversationId}`);
  if (prep?.kind === "not_found" && prep.redirectHandle) {
    redirect(`/nachrichten/neu?${new URLSearchParams({ ...sp, an: prep.redirectHandle } as Record<string, string>)}`);
  }
  const [items, counts] = await Promise.all([listConversations(user.id, "inbox"), inboxCounts(user.id)]);

  let main: React.ReactNode;
  if (!prep) {
    main = (
      <Form action="/nachrichten/neu" className="mx-auto mt-16 w-full max-w-md px-4">
        <p className="spec">Neue Nachricht</p>
        <h2 className="headline mt-2 text-2xl">An wen möchtest du schreiben?</h2>
        <label htmlFor="to" className="mt-6 block text-[13px] font-semibold">Benutzername</label>
        <div className="mt-1.5 flex items-center border border-line-strong bg-card focus-within:border-moss rounded-2xl">
          <span className="pl-3 text-muted">@</span>
          <input id="to" name="an" required autoFocus autoComplete="off" placeholder="handle" className="h-11 flex-1 bg-transparent px-2 outline-none" />
          <button type="submit" className="h-11 border-l border-line-strong px-4 text-sm font-semibold hover:bg-sunken">Weiter</button>
        </div>
        <p className="mt-2 text-xs text-muted">Du findest den Benutzernamen unter dem Namen jedes Profils, z. B. @anna.holz.</p>
      </Form>
    );
  } else if (prep.kind === "ok") {
    main = (
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-5">
          <Link href="/nachrichten" className="grid size-9 place-items-center text-muted hover:text-ink md:hidden" aria-label="Zurück"><ArrowLeft size={18} /></Link>
          <Avatar src={prep.recipient.avatarUrl} name={prep.recipient.displayName} size={36} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{prep.recipient.displayName}</p>
            <p className="truncate text-xs text-muted">@{prep.recipient.handle}</p>
          </div>
        </header>
        {prep.context && (
          <div className="border-b border-line px-3 py-2.5 sm:px-5">
            <p className="border border-clay/40 bg-clay-soft px-3 py-2 text-sm rounded-2xl"><span className="spec block text-clay-ink">{prep.context.orderId ? "Zur Bestellung" : "Zum Produkt"}</span>{prep.context.label}</p>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <Avatar src={prep.recipient.avatarUrl} name={prep.recipient.displayName} size={72} />
          <p className="headline mt-4 text-2xl">{prep.recipient.displayName}</p>
          {prep.recipient.bio && <p className="mt-2 max-w-sm text-sm text-muted line-clamp-3">{prep.recipient.bio}</p>}
          {prep.asRequest && (
            <p className="rounded-2xl mt-5 max-w-sm bg-sunken px-3 py-2 text-left text-xs text-ink-2">
              {prep.recipient.displayName} folgt dir nicht. Deine Nachricht wird als <strong>Kontaktanfrage</strong> zugestellt – bis zur Annahme kannst du bis zu drei Nachrichten senden.
            </p>
          )}
          <p className="mt-4 max-w-sm text-[11px] text-muted">Bleib freundlich und bezahle nie ausserhalb des Werkuno-Checkouts.</p>
        </div>
        <NewConversationComposer handle={prep.recipient.handle} orderId={prep.context?.orderId} productId={prep.context?.productId} name={prep.recipient.displayName} />
      </div>
    );
  } else {
    const msg = {
      not_found: { title: "Profil nicht gefunden", body: `Es gibt kein Profil mit dem Namen @${handle}.` },
      self: { title: "Das bist du", body: "Du kannst dir nicht selbst schreiben." },
      unavailable: { title: "Nicht möglich", body: "Du kannst dieser Person keine Nachrichten senden." },
      bad_context: { title: "Kontext passt nicht", body: "Diese Bestellung bzw. dieses Produkt gehört nicht zu euch beiden." },
      closed: { title: "Keine Direktnachrichten", body: `${("recipient" in prep && prep.recipient?.displayName) || "Diese Person"} nimmt keine Direktnachrichten an. Bei Fragen zu einer Bestellung kannst du über die Bestellung schreiben.` },
      restricted: { title: "Nachrichten eingeschränkt", body: `Deine Nachrichtenfunktion ist${"until" in prep && prep.until ? ` bis ${formatDate(prep.until, { day: "numeric", month: "long" })}` : ""} eingeschränkt.` },
    }[prep.kind];
    main = (
      <div className="mx-auto mt-16 w-full max-w-md px-4">
        <Notice tone={prep.kind === "restricted" ? "danger" : "warn"} title={msg.title}>{msg.body}</Notice>
        <Link href="/nachrichten/neu" className="mt-4 inline-block text-sm font-semibold hover:underline">Andere Person wählen</Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] md:h-dvh">
      <InboxPane box="inbox" items={items} counts={counts} className="hidden w-[340px] shrink-0 md:flex lg:w-[380px]" />
      <div className="min-w-0 flex-1">{main}</div>
    </div>
  );
}
