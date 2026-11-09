"use client";

import { confirmDialog } from "@/components/ui/confirm";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Combine, PackagePlus, Pencil, Printer, Trash2, X, Share2 } from "lucide-react";
import type { ShoppingListView } from "@/server/materials/service";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { MoreMenu, type MenuItem } from "@/components/social/actions";
import { cn, pad } from "@/lib/utils";
import {
  addShoppingListItemAction,
  clearDoneItemsAction,
  createShoppingListAction,
  deleteShoppingListAction,
  mergeShoppingListsAction,
  removeShoppingListItemAction,
  renameShoppingListAction,
  setShoppingListSharedAction,
  stockFromShoppingItemAction,
  updateShoppingListItemAction,
} from "@/app/(app)/einkaufslisten/actions";
import { MaterialInput } from "./line-editor";

type Item = ShoppingListView["items"][number];

/**
 * Einkaufsliste bearbeiten (PRD §17): Menge, „habe ich“, „gekauft“, entfernen,
 * zusammenführen, teilen (schreibgeschützter Link), drucken.
 */
export function ShoppingListEditor({ list, otherLists }: { list: ShoppingListView; otherLists: { id: string; title: string; total: number }[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(list.items);
  const [title, setTitle] = useState(list.title);
  const [renaming, setRenaming] = useState(false);
  const [token, setToken] = useState(list.shareToken);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeFrom, setMergeFrom] = useState(otherLists[0]?.id ?? "");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [materialId, setMaterialId] = useState<string | undefined>();
  const [pending, start] = useTransition();

  const open = items.filter((i) => !i.purchased && !i.haveIt);
  const done = items.filter((i) => i.purchased || i.haveIt);
  const pct = items.length ? Math.round((done.length / items.length) * 100) : 0;
  const sharePath = token ? `/liste/${token}` : null;
  const linkField = useRef<HTMLInputElement>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);

  /** Link kopieren; klappt das nicht (keine Berechtigung, unsicherer Kontext), wird er zum manuellen Kopieren markiert. */
  const copyLink = async (url: string, success: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast(success);
    } catch {
      // Kurz warten: Nach dem Aktivieren der Freigabe wird das Linkfeld erst gerendert
      setTimeout(() => {
        linkField.current?.focus();
        linkField.current?.select();
      }, 50);
      toast("Kopieren nicht möglich – Link markiert. Kopiere ihn manuell.", "error");
    }
  };

  const patch = (id: string, p: Partial<Pick<Item, "quantity" | "haveIt" | "purchased">>) => {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
    start(async () => {
      const r = await updateShoppingListItemAction(id, p);
      if (!r.ok) {
        setItems(prev);
        toast(r.error, "error");
      }
    });
  };

  const remove = (id: string) => {
    const prev = items;
    setItems((xs) => xs.filter((x) => x.id !== id));
    start(async () => {
      const r = await removeShoppingListItemAction(id);
      if (!r.ok) {
        setItems(prev);
        toast(r.error, "error");
      }
    });
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    start(async () => {
      const r = await addShoppingListItemAction(list.id, { name, quantity: qty, materialId });
      if (r.ok) {
        setItems((xs) => [...xs, { id: r.data.id, name: name.trim(), quantity: qty.trim(), haveIt: false, purchased: false, sourceType: null, sourceTitle: null, category: null, materialId: materialId ?? null, materialSlug: null }]);
        setName("");
        setQty("");
        setMaterialId(undefined);
      } else toast(r.error, "error");
    });
  };

  const share = (on: boolean) =>
    start(async () => {
      const r = await setShoppingListSharedAction(list.id, on);
      if (r.ok) {
        setToken(r.data.shareToken);
        if (on && r.data.shareToken) {
          await copyLink(`${location.origin}/liste/${r.data.shareToken}`, "Freigabelink kopiert. Wer ihn hat, kann die Liste lesen – nicht bearbeiten.");
        } else toast(r.message ?? "Freigabe beendet.");
      } else toast(r.error, "error");
    });

  const menu: MenuItem[] = [
    { label: "Umbenennen", icon: <Pencil size={15} />, onSelect: () => setRenaming(true) },
    ...(otherLists.length ? [{ label: "Mit anderer Liste zusammenführen", icon: <Combine size={15} />, onSelect: () => setMergeOpen(true) }] : []),
    ...(done.length ? [{ label: "Erledigte entfernen", icon: <Check size={15} />, onSelect: () => start(async () => {
      const r = await clearDoneItemsAction(list.id);
      if (r.ok) {
        setItems((xs) => xs.filter((x) => !x.purchased && !x.haveIt));
        toast(r.message ?? "Entfernt.");
      } else toast(r.error, "error");
    }) }] : []),
    { label: "Drucken", icon: <Printer size={15} />, onSelect: () => window.print() },
    {
      label: "Liste löschen",
      icon: <Trash2 size={15} />,
      danger: true,
      onSelect: async () =>
        (await confirmDialog(`«${title}» löschen?`)) &&
        start(async () => {
          const r = await deleteShoppingListAction(list.id);
          if (r.ok) router.push("/einkaufslisten");
          else toast(r.error, "error");
        }),
    },
  ];

  return (
    <div>
      <header className="mb-8">
        <Link href="/einkaufslisten" className="spec hover:text-ink print:hidden">Einkaufslisten</Link>
        {renaming ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await renameShoppingListAction(list.id, { title });
                if (r.ok) setRenaming(false);
                else toast(r.error, "error");
              });
            }}
          >
            <Label htmlFor="list-title" className="sr-only">Titel</Label>
            <Input id="list-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus className="h-12 font-serif text-2xl" />
            <Button type="submit" disabled={pending}>Speichern</Button>
          </form>
        ) : (
          <div className="mt-2 flex items-start justify-between gap-4">
            <h1 className="display text-[2.4rem] text-balance sm:text-5xl">{title}</h1>
            <div className="flex shrink-0 items-center gap-2 pt-2 print:hidden">
              <Button variant="outline" onClick={() => share(!token)} disabled={pending} aria-pressed={!!token} className={cn(token && "border-moss bg-moss-soft text-moss-ink hover:border-moss")}>
                <Share2 size={17} strokeWidth={1.7} /> {token ? "Geteilt" : "Teilen"}
              </Button>
              <MoreMenu items={menu} label="Listenaktionen" variant="button" />
            </div>
          </div>
        )}
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="spec">{done.length} von {items.length} erledigt</span>
            <span className="font-mono text-[12px] num">{pct}%</span>
          </div>
          <div className="mt-1.5 h-[3px] bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Fortschritt der Einkaufsliste">
            <div className="h-full bg-moss transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {token && sharePath && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border border-line bg-sunken px-3 py-2 text-[13px] print:hidden rounded-2xl">
            <span className="spec">Nur lesen</span>
            <input
              ref={linkField}
              readOnly
              value={`${origin}${sharePath}`}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Freigabelink"
              className="min-w-0 flex-1 truncate rounded-lg bg-transparent font-mono text-[12px] text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-moss"
            />
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => copyLink(`${location.origin}${sharePath}`, "Link kopiert.")}>Kopieren</button>
            <button type="button" className="text-muted hover:text-danger" onClick={() => share(false)}>Freigabe beenden</button>
          </div>
        )}
      </header>

      <form onSubmit={add} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2 border-b border-rule pb-4 print:hidden">
        <MaterialInput
          value={name}
          linked={!!materialId}
          invalid={false}
          label="Neue Position"
          onText={(v) => {
            setName(v);
            setMaterialId(undefined);
          }}
          onPick={(s) => {
            setName(s.name);
            setMaterialId(s.id);
            if (!qty && s.unit) setQty(`1 ${s.unit}`);
          }}
        />
        <input value={qty} onChange={(e) => setQty(e.target.value)} maxLength={40} placeholder="Menge" aria-label="Menge" className="h-10 w-full border border-line-strong bg-card px-2.5 text-[14px] outline-none hover:border-muted focus:border-moss rounded-2xl" />
        <Button type="submit" disabled={pending || !name.trim()}>Hinzufügen</Button>
      </form>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Die Liste ist leer. Füge Positionen hinzu oder übernimm die Materialliste eines Projekts.</p>
      ) : (
        <>
          <ItemTable items={open} onPatch={patch} onRemove={remove} />
          {done.length > 0 && (
            <>
              <p className="spec mt-10 border-b border-line pb-2">Erledigt · {done.length}</p>
              <ItemTable items={done} onPatch={patch} onRemove={remove} muted />
            </>
          )}
        </>
      )}

      <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} title="Listen zusammenführen" description={`Alle Positionen der gewählten Liste werden in «${title}» übernommen. Gleiche Materialien werden zusammengefasst, die andere Liste danach gelöscht.`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mergeFrom) return;
            start(async () => {
              const r = await mergeShoppingListsAction(list.id, mergeFrom);
              if (r.ok) {
                setMergeOpen(false);
                toast(`${r.data.added} übernommen, ${r.data.merged} zusammengefasst.`);
                router.refresh();
              } else toast(r.error, "error");
            });
          }}
        >
          <ul className="space-y-1.5">
            {otherLists.map((l) => (
              <li key={l.id}>
                <label className={cn("flex cursor-pointer items-center gap-3 border px-3 py-2.5 text-sm rounded-2xl", mergeFrom === l.id ? "border-moss bg-moss-soft/60" : "border-line hover:border-line-strong")}>
                  <input type="radio" name="merge" checked={mergeFrom === l.id} onChange={() => setMergeFrom(l.id)} className="accent-[#B64B3A]" />
                  <span className="min-w-0 flex-1 truncate font-medium">{l.title}</span>
                  <span className="spec">{l.total} Pos.</span>
                </label>
              </li>
            ))}
          </ul>
          <Button type="submit" className="w-full" disabled={pending || !mergeFrom}>Zusammenführen</Button>
        </form>
      </Dialog>
    </div>
  );
}

function ItemTable({ items, onPatch, onRemove, muted }: { items: Item[]; onPatch: (id: string, p: Partial<Pick<Item, "quantity" | "haveIt" | "purchased">>) => void; onRemove: (id: string) => void; muted?: boolean }) {
  const [stocked, setStocked] = useState<Set<string>>(new Set());
  const [busy, start] = useTransition();
  if (!items.length) return null;
  const toStock = (it: Item) =>
    start(async () => {
      const r = await stockFromShoppingItemAction(it.id);
      if (r.ok) {
        setStocked((s) => new Set(s).add(it.id));
        toast(r.message ?? "Im Bestand.");
      } else toast(r.error, "error");
    });
  return (
    <ul className="divide-y divide-line">
      {items.map((it, i) => (
        <li key={it.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[1.75rem_minmax(0,1fr)_7rem_auto]">
          <span className="font-mono text-[11px] text-muted num">{pad(i + 1)}</span>
          <div className="min-w-0">
            <p className={cn("text-[15px] font-semibold", muted && "text-muted line-through decoration-line-strong")}>
              {it.materialSlug ? <Link href={`/materialien/${it.materialSlug}`} className="hover:underline">{it.name}</Link> : it.name}
            </p>
            {(it.sourceTitle || it.category) && <p className="spec truncate">{[it.category, it.sourceTitle && `aus ${it.sourceTitle}`].filter(Boolean).join(" · ")}</p>}
          </div>
          <input
            defaultValue={it.quantity}
            onBlur={(e) => e.target.value.trim() !== it.quantity && onPatch(it.id, { quantity: e.target.value.trim() })}
            maxLength={40}
            aria-label={`Menge für ${it.name}`}
            placeholder="Menge"
            className="col-start-2 h-9 w-full border border-line bg-card px-2 text-[13px] outline-none hover:border-line-strong focus:border-moss sm:col-start-auto print:border-0 rounded-2xl"
          />
          <div className="col-start-3 row-start-1 flex items-center gap-1 sm:col-start-auto sm:row-start-auto print:hidden">
            <ToggleChip active={it.haveIt} onClick={() => onPatch(it.id, { haveIt: !it.haveIt })} label="Habe ich" />
            <ToggleChip active={it.purchased} onClick={() => onPatch(it.id, { purchased: !it.purchased })} label="Gekauft" />
            {it.purchased && (
              <button
                type="button"
                disabled={busy || stocked.has(it.id)}
                onClick={() => toStock(it)}
                aria-label={stocked.has(it.id) ? `${it.name} ist im Bestand` : `${it.name} in den Bestand übernehmen`}
                title={stocked.has(it.id) ? "Im Bestand" : "In den Bestand übernehmen"}
                className={cn("grid size-8 place-items-center rounded-xl", stocked.has(it.id) ? "text-moss" : "text-muted hover:bg-sunken hover:text-ink")}
              >
                {stocked.has(it.id) ? <Check size={15} /> : <PackagePlus size={15} />}
              </button>
            )}
            <button type="button" onClick={() => onRemove(it.id)} aria-label={`${it.name} entfernen`} className="grid size-8 place-items-center text-muted hover:text-danger">
              <X size={15} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ToggleChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("inline-flex h-8 items-center gap-1.5 border px-2.5 text-[12px] font-semibold rounded-xl", active ? "border-moss bg-moss text-paper" : "border-line-strong bg-card text-ink-2 hover:border-rule-strong")}>
      <span className={cn("grid size-3 place-items-center border rounded-full", active ? "border-paper" : "border-rule")}>{active && <Check size={9} strokeWidth={3.5} />}</span>
      {label}
    </button>
  );
}

/** Neue Liste anlegen (Übersichtsseite). */
export function CreateShoppingList() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        start(async () => {
          const r = await createShoppingListAction({ title });
          if (r.ok) router.push(`/einkaufslisten/${r.data.id}`);
          else toast(r.error, "error");
        });
      }}
    >
      <Label htmlFor="new-list" className="sr-only">Titel der neuen Liste</Label>
      <Input id="new-list" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Neue Liste, z. B. Baumarkt Samstag" />
      <Button type="submit" variant="ink" disabled={pending || !title.trim()}>Anlegen</Button>
    </form>
  );
}
