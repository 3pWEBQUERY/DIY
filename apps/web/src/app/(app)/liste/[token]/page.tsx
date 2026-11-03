import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedShoppingList } from "@/server/materials/service";
import { Page } from "@/components/shell/page";
import { cn, formatDate, pad } from "@/lib/utils";

export const metadata: Metadata = { title: "Geteilte Einkaufsliste", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Öffentliche, schreibgeschützte Ansicht einer geteilten Einkaufsliste. */
export default async function SharedListPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const list = await getSharedShoppingList(token);
  if (!list) notFound();
  const open = list.items.filter((i) => !i.purchased && !i.haveIt);
  const done = list.items.filter((i) => i.purchased || i.haveIt);

  const Row = ({ it, i, muted }: { it: (typeof list.items)[number]; i: number; muted?: boolean }) => (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line py-3">
      <span className="font-mono text-[11px] text-muted num">{pad(i + 1)}</span>
      <span className="min-w-0">
        <span className={cn("block text-[15px] font-semibold", muted && "text-muted line-through decoration-line-strong")}>{it.name}</span>
        {(it.category || it.sourceTitle) && <span className="spec block truncate">{[it.category, it.sourceTitle && `aus ${it.sourceTitle}`].filter(Boolean).join(" · ")}</span>}
      </span>
      <span className="text-right text-[14px] num text-ink-2">
        {it.quantity || "–"}
        {muted && <span className="spec block">{it.purchased ? "gekauft" : "vorhanden"}</span>}
      </span>
    </li>
  );

  return (
    <Page width="feed">
      <p className="spec flex items-center gap-2"><span className="inline-block h-px w-6 bg-ink" />Geteilte Einkaufsliste · nur lesen</p>
      <h1 className="display mt-3 text-[2.4rem] text-balance sm:text-5xl">{list.title}</h1>
      <p className="mt-3 text-sm text-muted">
        von {list.owner.displayName || list.owner.handle} · Stand {formatDate(list.updatedAt, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      </p>
      <p className="spec mt-8 border-b border-ink pb-2 text-ink">Offen · {open.length}</p>
      {open.length ? <ol>{open.map((it, i) => <Row key={it.id} it={it} i={i} />)}</ol> : <p className="py-6 text-sm text-muted">Alles erledigt.</p>}
      {done.length > 0 && (
        <>
          <p className="spec mt-10 border-b border-line pb-2">Erledigt · {done.length}</p>
          <ol>{done.map((it, i) => <Row key={it.id} it={it} i={i} muted />)}</ol>
        </>
      )}
    </Page>
  );
}
