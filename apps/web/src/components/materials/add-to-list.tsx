"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListPlus } from "lucide-react";
import type { ShoppingListSummary } from "@/server/materials/service";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { addSourceToShoppingListAction, myShoppingListsAction } from "@/app/(app)/einkaufslisten/actions";

/**
 * „Materialliste übernehmen“: Materialien eines Projekts oder einer Anleitung in eine
 * neue oder bestehende Einkaufsliste übernehmen (PRD §17). Gleiche Materialien werden zusammengefasst.
 */
export function AddToShoppingList({ kind, id, title, count, signedIn, variant = "outline", className }: { kind: "PROJECT" | "TUTORIAL"; id: string; title: string; count: number; signedIn: boolean; variant?: "outline" | "ink" | "primary"; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ShoppingListSummary[] | null>(null);
  const [target, setTarget] = useState<string>("new");
  const [newTitle, setNewTitle] = useState(`Für: ${title}`.slice(0, 80));
  const [done, setDone] = useState<{ listId: string; added: number; merged: number } | null>(null);
  const [pending, start] = useTransition();

  const openDialog = () => {
    if (!signedIn) return router.push(`/anmelden?weiter=${encodeURIComponent(location.pathname)}`);
    setOpen(true);
    setDone(null);
    start(async () => {
      const r = await myShoppingListsAction();
      if (r.ok) {
        setLists(r.data);
        if (r.data[0]) setTarget(r.data[0].id);
      } else toast(r.error, "error");
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addSourceToShoppingListAction({ kind, id, listId: target === "new" ? null : target, newTitle: target === "new" ? newTitle : null });
      if (r.ok) setDone(r.data);
      else toast(r.error, "error");
    });
  };

  return (
    <>
      <Button variant={variant} size="sm" onClick={openDialog} disabled={count === 0} className={className}>
        <ListPlus size={15} /> Auf Einkaufsliste
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Materialliste übernehmen" description={`${count} ${count === 1 ? "Position" : "Positionen"} aus «${title}». Gleiche Materialien werden zusammengefasst.`}>
        {done ? (
          <div className="space-y-4">
            <p className="text-[15px]">
              <span className="font-semibold">{done.added}</span> neu übernommen
              {done.merged > 0 && (
                <>
                  , <span className="font-semibold">{done.merged}</span> mit bestehenden Positionen zusammengefasst
                </>
              )}
              .
            </p>
            <div className="flex gap-2">
              <Link href={`/einkaufslisten/${done.listId}`} className="inline-flex h-10 flex-1 items-center justify-center bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink-2 rounded-xl">
                Zur Einkaufsliste
              </Link>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Schliessen
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold">Ziel</legend>
              {lists === null ? (
                <p className="spec">Lade Listen …</p>
              ) : (
                <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                  {lists.map((l) => (
                    <li key={l.id}>
                      <label className={cn("flex cursor-pointer items-center gap-3 border px-3 py-2.5 text-sm rounded-2xl", target === l.id ? "border-rule bg-sunken" : "border-line hover:border-line-strong")}>
                        <input type="radio" name="target" value={l.id} checked={target === l.id} onChange={() => setTarget(l.id)} className="accent-[#B64B3A]" />
                        <span className="min-w-0 flex-1 truncate font-medium">{l.title}</span>
                        <span className="spec shrink-0">{l.total} Pos.</span>
                      </label>
                    </li>
                  ))}
                  <li>
                    <label className={cn("flex cursor-pointer items-center gap-3 border px-3 py-2.5 text-sm rounded-2xl", target === "new" ? "border-rule bg-sunken" : "border-line hover:border-line-strong")}>
                      <input type="radio" name="target" value="new" checked={target === "new"} onChange={() => setTarget("new")} className="accent-[#B64B3A]" />
                      <span className="font-medium">Neue Liste anlegen</span>
                    </label>
                  </li>
                </ul>
              )}
            </fieldset>
            {target === "new" && (
              <div>
                <Label htmlFor="new-list-title">Titel der neuen Liste</Label>
                <Input id="new-list-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={80} required />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={pending || lists === null}>
              {pending ? "Übernimmt …" : "Übernehmen"}
            </Button>
          </form>
        )}
      </Dialog>
    </>
  );
}
