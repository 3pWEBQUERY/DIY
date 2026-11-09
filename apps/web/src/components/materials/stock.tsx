"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PackageCheck, Plus, Search, X } from "lucide-react";
import type { StockEntry } from "@/server/materials/stock";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { addStockAction, removeStockAction, toggleStockAction, updateStockAction } from "@/app/(app)/materialien/actions";
import { MaterialInput } from "./line-editor";

/** „Habe ich“-Schalter für ein Material der Datenbank. */
export function StockToggle({ materialId, name, initialHave, signedIn, size = "md", className }: { materialId: string; name: string; initialHave: boolean; signedIn: boolean; size?: "sm" | "md"; className?: string }) {
  const router = useRouter();
  const [have, setHave] = useState(initialHave);
  const [pending, start] = useTransition();
  const toggle = () => {
    if (!signedIn) return router.push(`/anmelden?weiter=${encodeURIComponent(location.pathname)}`);
    const next = !have;
    setHave(next);
    start(async () => {
      const r = await toggleStockAction(materialId, next);
      if (!r.ok) {
        setHave(!next);
        toast(r.error, "error");
      } else if (size === "md") toast(next ? `«${name}» ist in deinem Bestand.` : `«${name}» aus dem Bestand entfernt.`);
    });
  };
  return (
    <button
      type="button"
      aria-pressed={have}
      onClick={toggle}
      disabled={pending}
      title={have ? "In deinem Bestand – zum Entfernen klicken" : "Zu deinem Bestand hinzufügen"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold transition-colors",
        size === "sm" ? "h-7 px-2.5 text-[11.5px]" : "h-10 px-4 text-[13.5px]",
        have ? "border-moss bg-moss text-paper hover:bg-moss-ink" : "border-line-strong bg-card text-ink-2 hover:border-rule-strong hover:text-ink",
        className,
      )}
    >
      {have ? <Check size={size === "sm" ? 12 : 15} strokeWidth={3} aria-hidden /> : <Plus size={size === "sm" ? 12 : 15} aria-hidden />}
      {have ? "Habe ich" : size === "sm" ? "Habe ich" : "Habe ich schon"}
    </button>
  );
}

/** Verwaltung „Mein Bestand“: hinzufügen, Menge/Notiz pflegen, entfernen, filtern. */
export function StockManager({ initial }: { initial: StockEntry[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState(initial);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [materialId, setMaterialId] = useState<string | undefined>();
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    start(async () => {
      const r = await addStockAction({ materialId: materialId ?? null, name, quantity: qty });
      if (r.ok) {
        setName("");
        setQty("");
        setMaterialId(undefined);
        router.refresh();
        toast(r.message ?? "Gespeichert.");
      } else toast(r.error, "error");
    });
  };

  // Server-Stand übernehmen, sobald router.refresh() neue Daten liefert
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setEntries(initial);
  }

  const patch = (id: string, p: { quantity?: string; note?: string }) => {
    setEntries((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
    start(async () => {
      const r = await updateStockAction(id, p);
      if (!r.ok) toast(r.error, "error");
    });
  };
  const remove = async (e: StockEntry) => {
    if (!(await confirmDialog({ title: `«${e.name}» aus dem Bestand entfernen?`, confirmLabel: "Entfernen", tone: "danger" }))) return;
    const prev = entries;
    setEntries((xs) => xs.filter((x) => x.id !== e.id));
    start(async () => {
      const r = await removeStockAction(e.id);
      if (!r.ok) {
        setEntries(prev);
        toast(r.error, "error");
      }
    });
  };

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const shown = f ? entries.filter((e) => `${e.name} ${e.note} ${e.category?.name ?? ""}`.toLowerCase().includes(f)) : entries;
    const map = new Map<string, StockEntry[]>();
    for (const e of shown) {
      const k = e.category?.name ?? "Eigene Einträge";
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()].sort((a, b) => (a[0] === "Eigene Einträge" ? 1 : b[0] === "Eigene Einträge" ? -1 : a[0].localeCompare(b[0], "de")));
  }, [entries, filter]);

  return (
    <div>
      <form onSubmit={add} className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2 rounded-2xl border border-line bg-card p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
        <MaterialInput
          value={name}
          linked={!!materialId}
          invalid={false}
          label="Material zum Bestand hinzufügen"
          onText={(v) => {
            setName(v);
            setMaterialId(undefined);
          }}
          onPick={(s) => {
            setName(s.name);
            setMaterialId(s.id);
          }}
        />
        <input value={qty} onChange={(e) => setQty(e.target.value)} maxLength={40} placeholder="Menge (optional)" aria-label="Menge" className="h-10 w-full rounded-2xl border border-line-strong bg-card px-2.5 text-[14px] outline-none hover:border-muted focus:border-moss" />
        <Button type="submit" disabled={pending || !name.trim()} className="col-span-2 sm:col-span-1">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Hinzufügen
        </Button>
      </form>

      {entries.length > 8 && (
        <div className="relative mt-6 max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Im Bestand suchen …" aria-label="Im Bestand suchen" className="h-10 w-full rounded-2xl border border-line-strong bg-card pl-9 pr-3 text-[14px] outline-none hover:border-muted focus:border-moss" />
        </div>
      )}

      {entries.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
          <PackageCheck size={28} className="mx-auto text-muted" aria-hidden />
          <p className="mt-3 text-[15px] font-semibold">Dein Bestand ist noch leer</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[13.5px] text-muted">Trag ein, was du schon zu Hause hast – oder tippe bei einem Material auf „Habe ich schon“. In Materiallisten und Einkaufslisten siehst du dann sofort, was dir noch fehlt.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-9">
          {groups.map(([group, rows]) => (
            <section key={group} aria-label={group}>
              <p className="spec border-b border-rule pb-2">
                {group} · {rows.length}
              </p>
              <ul className="divide-y divide-line">
                {rows.map((e) => (
                  <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,14rem)_auto]">
                    <div className="min-w-0">
                      {e.slug ? (
                        <Link href={`/materialien/${e.slug}`} className="block truncate text-[15px] font-semibold hover:underline">
                          {e.name}
                        </Link>
                      ) : (
                        <span className="block truncate text-[15px] font-semibold">{e.name}</span>
                      )}
                      {e.type && <span className="spec">{[e.type, e.unit].filter(Boolean).join(" · ")}</span>}
                    </div>
                    <input
                      defaultValue={e.quantity}
                      onBlur={(ev) => ev.target.value.trim() !== e.quantity && patch(e.id, { quantity: ev.target.value.trim() })}
                      maxLength={40}
                      placeholder="Menge"
                      aria-label={`Menge von ${e.name}`}
                      className="col-start-1 h-9 w-full rounded-xl border border-line bg-card px-2.5 text-[13px] outline-none hover:border-line-strong focus:border-moss sm:col-start-auto"
                    />
                    <input
                      defaultValue={e.note}
                      onBlur={(ev) => ev.target.value.trim() !== e.note && patch(e.id, { note: ev.target.value.trim() })}
                      maxLength={200}
                      placeholder="Notiz, z. B. Farbe, Lagerort"
                      aria-label={`Notiz zu ${e.name}`}
                      className="col-span-2 h-9 w-full rounded-xl border border-line bg-card px-2.5 text-[13px] outline-none hover:border-line-strong focus:border-moss sm:col-span-1"
                    />
                    <button type="button" onClick={() => void remove(e)} className="col-start-2 row-start-1 grid size-8 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-danger sm:col-start-auto sm:row-start-auto" aria-label={`${e.name} entfernen`} title="Entfernen">
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {groups.length === 0 && <p className="text-[14px] text-muted">Nichts gefunden für «{filter}».</p>}
        </div>
      )}
    </div>
  );
}
