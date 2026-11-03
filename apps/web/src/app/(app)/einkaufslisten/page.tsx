import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { listMyShoppingLists } from "@/server/materials/service";
import { Page, PageHeader } from "@/components/shell/page";
import { Empty } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { CreateShoppingList } from "@/components/materials/shopping-list";
import { pad, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Einkaufslisten", robots: { index: false } };

export default async function ShoppingListsPage() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/einkaufslisten");
  const lists = await listMyShoppingLists(user.id);

  return (
    <Page width="feed">
      <PageHeader kicker="Werkbank" title="Einkaufslisten" description="Übernimm Materiallisten aus Projekten und Anleitungen, fasse sie zusammen und hake ab, was du schon hast." />
      <CreateShoppingList />
      {lists.length ? (
        <ol className="mt-8 border-t border-ink">
          {lists.map((l, i) => {
            const pct = l.total ? Math.round((l.done / l.total) * 100) : 0;
            return (
              <li key={l.id} className="border-b border-line">
                <Link href={`/einkaufslisten/${l.id}`} className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-4 py-4">
                  <span className="font-mono text-[11px] text-muted num">{pad(i + 1)}</span>
                  <span className="min-w-0">
                    <span className="headline block truncate text-xl group-hover:underline decoration-1 underline-offset-4">{l.title}</span>
                    <span className="spec block truncate">
                      {l.total} Positionen · {relativeTime(l.updatedAt)}
                      {l.sources.length ? ` · aus ${l.sources.join(", ")}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {l.shared && <Link2 size={14} className="text-muted" aria-label="Geteilt" />}
                    <span className="w-20">
                      <span className="block text-right font-mono text-[11px] num">{l.done}/{l.total}</span>
                      <span className="mt-1 block h-[3px] bg-line" aria-hidden>
                        <span className="block h-full bg-moss" style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty
          className="mt-8"
          title="Noch keine Einkaufsliste"
          body="Auf jeder Projekt- und Anleitungsseite findest du «Auf Einkaufsliste» – damit landen alle Materialien hier."
          action={<LinkButton href="/projekte" variant="outline">Projekte entdecken</LinkButton>}
        />
      )}
    </Page>
  );
}
