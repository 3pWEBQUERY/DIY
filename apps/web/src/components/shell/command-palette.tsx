"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Hit = { type: string; id: string; title: string; subtitle?: string; href: string };

const TYPE_LABEL: Record<string, string> = {
  user: "Mitglied",
  project: "Projekt",
  tutorial: "Anleitung",
  product: "Produkt",
  post: "Beitrag",
  article: "Artikel",
  community: "Community",
  action: "Aktion",
};

const ACTIONS: Hit[] = [
  { type: "action", id: "a1", title: "Neuer Beitrag", subtitle: "Foto, Video oder Gedanke teilen", href: "/erstellen?typ=beitrag" },
  { type: "action", id: "a2", title: "Neues Projekt", subtitle: "Projekt dokumentieren", href: "/erstellen?typ=projekt" },
  { type: "action", id: "a3", title: "Neue Anleitung", subtitle: "Schritt-für-Schritt-Tutorial", href: "/studio/anleitungen/neu" },
  { type: "action", id: "a4", title: "Neuer Artikel", subtitle: "Blogbeitrag schreiben", href: "/studio/blog/neu" },
  { type: "action", id: "a5", title: "Einkaufslisten", subtitle: "Materialien organisieren", href: "/einkaufslisten" },
  { type: "action", id: "a6", title: "Creator Studio", subtitle: "Inhalte, Shop & Statistiken", href: "/studio" },
];

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent("wr:palette"));
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wr:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wr:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setTimeout(() => input.current?.focus(), 10);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}&limit=4`, { signal: ctrl.signal });
        if (res.ok) {
          const json = (await res.json()) as { data: Hit[] };
          setHits(json.data);
          setActive(0);
        }
      } catch {
        /* abgebrochen */
      } finally {
        setLoading(false);
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const list = useMemo(() => {
    const actions = ACTIONS.filter((a) => !q || a.title.toLowerCase().includes(q.toLowerCase()));
    const searchAll: Hit[] = q.trim() ? [{ type: "action", id: "search", title: `Alle Ergebnisse für „${q}“`, href: `/suche?q=${encodeURIComponent(q)}` }] : [];
    return [...hits, ...searchAll, ...actions];
  }, [hits, q]);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    router.push(h.href);
  }

  return (
    <dialog
      ref={dialog}
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === dialog.current && setOpen(false)}
      aria-label="Befehlspalette"
      className="mt-[12vh] mx-auto w-[min(100vw-1.5rem,40rem)] border border-rule bg-card p-0 text-ink open:animate-rise rounded-2xl"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={18} className="text-muted" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, list.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && list[active]) {
              e.preventDefault();
              go(list[active]!);
            }
          }}
          placeholder="Projekte, Anleitungen, Creator, Produkte …"
          className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={list[active] ? `pal-${list[active]!.id}` : undefined}
        />
        {loading && <span className="spec">suche …</span>}
      </div>
      <ul id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto py-2">
        {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Keine Treffer. Versuch es mit einem Material oder einer Technik.</li>}
        {list.map((h, i) => (
          <li
            key={`${h.type}-${h.id}`}
            id={`pal-${h.id}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(h)}
            className={cn("mx-2 flex cursor-pointer items-center gap-3 px-3 py-2.5", i === active && "bg-sunken")}
          >
            <span className="w-20 shrink-0 spec">{TYPE_LABEL[h.type] ?? h.type}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{h.title}</span>
              {h.subtitle && <span className="block truncate text-xs text-muted">{h.subtitle}</span>}
            </span>
            {i === active ? <CornerDownLeft size={14} className="text-muted" /> : <ArrowRight size={14} className="text-line-strong" />}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 spec">
        <span>↑↓ wählen</span>
        <span>↵ öffnen</span>
        <span>esc schliessen</span>
      </div>
    </dialog>
  );
}
