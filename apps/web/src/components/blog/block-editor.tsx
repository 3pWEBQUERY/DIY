"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  BookOpen,
  Film,
  Heading2,
  Heading3,
  ImagePlus,
  Images,
  Info,
  Italic,
  Layers,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  Minus,
  Pilcrow,
  Plus,
  Quote,
  Search,
  ShoppingBag,
  Table2,
  Trash2,
  TriangleAlert,
  X,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import type { ArticleBlock, ArticleBlockType } from "@werkraum/shared";
import { uploadFile } from "@/components/media/uploader";
import { Plate } from "@/components/ui/media";
import { Kbd } from "@/components/ui/misc";
import { cn, pad } from "@/lib/utils";

/* ─────────────────────────── Modell ─────────────────────────── */

type Of<T extends ArticleBlockType> = Extract<ArticleBlock, { type: T }>;
type Patch = (id: string, p: Record<string, unknown>) => void;

export function blockId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

type MenuItem = { key: string; label: string; hint: string; icon: ReactNode; group: string; keywords: string; make: () => ArticleBlock };

const MENU: MenuItem[] = [
  { key: "p", group: "Text", label: "Absatz", hint: "Fliesstext mit **fett**, *kursiv*, [Link](…)", icon: <Pilcrow size={16} />, keywords: "absatz text paragraph", make: () => ({ id: blockId(), type: "paragraph", text: "" }) },
  { key: "h2", group: "Text", label: "Überschrift", hint: "Abschnittstitel", icon: <Heading2 size={16} />, keywords: "überschrift titel heading h2", make: () => ({ id: blockId(), type: "heading", level: 2, text: "" }) },
  { key: "h3", group: "Text", label: "Zwischentitel", hint: "Kleinere Überschrift", icon: <Heading3 size={16} />, keywords: "zwischentitel unterüberschrift h3", make: () => ({ id: blockId(), type: "heading", level: 3, text: "" }) },
  { key: "ul", group: "Text", label: "Liste", hint: "Aufzählung mit Strichen", icon: <List size={16} />, keywords: "liste aufzählung bullet", make: () => ({ id: blockId(), type: "list", ordered: false, items: [""] }) },
  { key: "ol", group: "Text", label: "Nummerierte Liste", hint: "Schritte, Reihenfolge", icon: <ListOrdered size={16} />, keywords: "nummeriert liste schritte ordered", make: () => ({ id: blockId(), type: "list", ordered: true, items: [""] }) },
  { key: "quote", group: "Text", label: "Zitat", hint: "Hervorgehobenes Zitat mit Quelle", icon: <Quote size={16} />, keywords: "zitat quote", make: () => ({ id: blockId(), type: "quote", text: "", cite: "" }) },
  { key: "callout", group: "Text", label: "Hinweis", hint: "Info, Tipp oder Warnung", icon: <Info size={16} />, keywords: "hinweis tipp warnung callout info", make: () => ({ id: blockId(), type: "callout", tone: "info", text: "" }) },
  { key: "image", group: "Medien", label: "Bild", hint: "Foto mit Alt-Text und Bildunterschrift", icon: <ImagePlus size={16} />, keywords: "bild foto image", make: () => ({ id: blockId(), type: "image", mediaId: "", url: "", alt: "", caption: "" }) },
  { key: "gallery", group: "Medien", label: "Galerie", hint: "Mehrere Bilder im Raster", icon: <Images size={16} />, keywords: "galerie bilder gallery", make: () => ({ id: blockId(), type: "gallery", images: [] }) },
  { key: "video", group: "Medien", label: "Video", hint: "Kurzes Video (max. 3 Min.)", icon: <Film size={16} />, keywords: "video film", make: () => ({ id: blockId(), type: "video", mediaId: "", url: "", caption: "" }) },
  { key: "table", group: "Struktur", label: "Tabelle", hint: "Erste Zeile ist die Kopfzeile", icon: <Table2 size={16} />, keywords: "tabelle table masse", make: () => ({ id: blockId(), type: "table", rows: [["", ""], ["", ""]] }) },
  { key: "divider", group: "Struktur", label: "Trennlinie", hint: "Abschnitt optisch trennen", icon: <Minus size={16} />, keywords: "trennlinie divider linie", make: () => ({ id: blockId(), type: "divider" }) },
  { key: "project", group: "Einbetten", label: "Projektkarte", hint: "Eines deiner Projekte verlinken", icon: <Layers size={16} />, keywords: "projekt karte einbetten", make: () => ({ id: blockId(), type: "projectCard", projectId: "" }) },
  { key: "tutorial", group: "Einbetten", label: "Anleitungskarte", hint: "Eine deiner Anleitungen verlinken", icon: <BookOpen size={16} />, keywords: "anleitung tutorial karte", make: () => ({ id: blockId(), type: "tutorialCard", tutorialId: "" }) },
  { key: "product", group: "Einbetten", label: "Produktkarte", hint: "Ein Produkt aus deinem Shop", icon: <ShoppingBag size={16} />, keywords: "produkt shop karte verkauf", make: () => ({ id: blockId(), type: "productCard", productId: "" }) },
];

const TYPE_LABEL: Record<ArticleBlockType, string> = {
  heading: "Titel",
  paragraph: "Absatz",
  list: "Liste",
  quote: "Zitat",
  image: "Bild",
  gallery: "Galerie",
  video: "Video",
  table: "Tabelle",
  callout: "Hinweis",
  projectCard: "Projekt",
  tutorialCard: "Anleitung",
  productCard: "Produkt",
  divider: "Linie",
};

function filterMenu(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return MENU;
  return MENU.filter((m) => m.label.toLowerCase().includes(s) || m.keywords.includes(s));
}

/** Entfernt unvollständige Blöcke (z.B. Bild ohne Upload) vor dem Speichern. */
export function sanitizeBlocks(blocks: ArticleBlock[]): ArticleBlock[] {
  return blocks.flatMap((b): ArticleBlock[] => {
    switch (b.type) {
      case "image":
      case "video":
        return b.mediaId ? [b] : [];
      case "gallery": {
        const images = b.images.filter((i) => i.mediaId);
        return images.length ? [{ ...b, images }] : [];
      }
      case "projectCard":
        return b.projectId ? [b] : [];
      case "tutorialCard":
        return b.tutorialId ? [b] : [];
      case "productCard":
        return b.productId ? [b] : [];
      case "list": {
        const items = b.items.filter((i) => i.trim());
        return items.length ? [{ ...b, items }] : [];
      }
      default:
        return [b];
    }
  });
}

/* ─────────────────────────── Editor ─────────────────────────── */

type MenuState = { mode: "slash"; blockId: string; active: number } | { mode: "insert"; index: number; active: number; query: string };

export function BlockEditor({ blocks, onChange, label = "Inhalt" }: { blocks: ArticleBlock[]; onChange: (next: ArticleBlock[]) => void; label?: string }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [focusReq, setFocusReq] = useState<{ id: string; at: "start" | "end" } | null>(null);
  const [announce, setAnnounce] = useState("");
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  useLayoutEffect(() => {
    if (!focusReq) return;
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(`[data-block-input="${focusReq.id}"]`);
    if (el) {
      el.focus();
      if ("setSelectionRange" in el && typeof el.value === "string") {
        const pos = focusReq.at === "start" ? 0 : el.value.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch {
          /* Inputs ohne Selektion */
        }
      }
    }
    setFocusReq(null);
  }, [focusReq, blocks]);

  /** Mutationen schreiben sofort in die Ref, damit mehrere Aufrufe hintereinander (z.B. Absatz teilen) sich nicht überschreiben. */
  const commit = (next: ArticleBlock[]) => {
    blocksRef.current = next;
    onChange(next);
  };
  const patch: Patch = (id, p) => commit(blocksRef.current.map((b) => (b.id === id ? ({ ...b, ...p } as ArticleBlock) : b)));
  const insertAt = (index: number, b: ArticleBlock) => {
    const next = [...blocksRef.current];
    next.splice(index, 0, b);
    commit(next);
    setFocusReq({ id: b.id, at: "start" });
    setAnnounce(`${TYPE_LABEL[b.type]} eingefügt`);
  };
  const replace = (id: string, b: ArticleBlock) => {
    commit(blocksRef.current.map((x) => (x.id === id ? b : x)));
    setFocusReq({ id: b.id, at: "start" });
    setAnnounce(`${TYPE_LABEL[b.type]} eingefügt`);
  };
  const remove = (id: string, focusPrev = true) => {
    const idx = blocksRef.current.findIndex((b) => b.id === id);
    const next = blocksRef.current.filter((b) => b.id !== id);
    commit(next);
    const target = next[Math.max(0, idx - 1)];
    if (focusPrev && target) setFocusReq({ id: target.id, at: "end" });
    setAnnounce("Block entfernt");
  };
  const move = (id: string, dir: -1 | 1) => {
    const idx = blocksRef.current.findIndex((b) => b.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= blocksRef.current.length) return;
    const next = [...blocksRef.current];
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    commit(next);
    setFocusReq({ id, at: "end" });
    setAnnounce(`Block nach ${dir < 0 ? "oben" : "unten"} verschoben – Position ${j + 1}`);
  };
  const focusNeighbour = (id: string, dir: -1 | 1) => {
    const idx = blocksRef.current.findIndex((b) => b.id === id);
    const t = blocksRef.current[idx + dir];
    if (t) setFocusReq({ id: t.id, at: dir < 0 ? "end" : "start" });
  };

  const ctx: BlockCtx = { patch, insertAt, replace, remove, move, focusNeighbour, menu, setMenu, blocks };

  return (
    <div role="group" aria-label={label} className="relative">
      <p className="sr-only" aria-live="polite">{announce}</p>
      {blocks.length === 0 && (
        <button
          type="button"
          onClick={() => insertAt(0, { id: blockId(), type: "paragraph", text: "" })}
          className="block w-full border border-dashed border-line-strong px-6 py-10 text-left font-serif text-xl text-muted hover:border-ink hover:text-ink"
        >
          Beginne zu schreiben …
          <span className="mt-2 block font-sans text-sm">Tippe <Kbd>/</Kbd> in einem leeren Absatz, um Bilder, Tabellen oder Projektkarten einzufügen.</span>
        </button>
      )}
      <ol className="space-y-1">
        {blocks.map((b, i) => (
          <li key={b.id}>
            {i > 0 && <Inserter index={i} ctx={ctx} />}
            <BlockShell block={b} index={i} count={blocks.length} ctx={ctx} />
          </li>
        ))}
      </ol>
      {blocks.length > 0 && (
        <div className="relative mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setMenu({ mode: "insert", index: blocks.length, active: 0, query: "" })}
            aria-haspopup="listbox"
            aria-expanded={menu?.mode === "insert" && menu.index === blocks.length}
            className="inline-flex h-9 items-center gap-2 border border-line-strong bg-card px-3 text-sm font-semibold hover:border-ink"
          >
            <Plus size={15} /> Block hinzufügen
          </button>
          <span className="text-xs text-muted">
            oder <Kbd>/</Kbd> in leerem Absatz · <Kbd>Enter</Kbd> neuer Absatz · <Kbd>Alt</Kbd>+<Kbd>↑</Kbd>/<Kbd>↓</Kbd> verschieben · <Kbd>⌘</Kbd>+<Kbd>S</Kbd> speichern
          </span>
          {menu?.mode === "insert" && menu.index === blocks.length && <InsertMenu ctx={ctx} index={blocks.length} className="left-0 top-full mt-1" />}
        </div>
      )}
    </div>
  );
}

type BlockCtx = {
  patch: Patch;
  insertAt: (index: number, b: ArticleBlock) => void;
  replace: (id: string, b: ArticleBlock) => void;
  remove: (id: string, focusPrev?: boolean) => void;
  move: (id: string, dir: -1 | 1) => void;
  focusNeighbour: (id: string, dir: -1 | 1) => void;
  menu: MenuState | null;
  setMenu: (m: MenuState | null) => void;
  blocks: ArticleBlock[];
};

function Inserter({ index, ctx }: { index: number; ctx: BlockCtx }) {
  const open = ctx.menu?.mode === "insert" && ctx.menu.index === index;
  return (
    <div className={cn("group/ins relative -my-1 flex h-4 items-center pl-12", open && "z-40")}>
      <button
        type="button"
        aria-label={`Block an Position ${index + 1} einfügen`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => ctx.setMenu(open ? null : { mode: "insert", index, active: 0, query: "" })}
        className={cn(
          "flex w-full items-center gap-2 text-muted opacity-0 transition-opacity focus-visible:opacity-100 group-hover/ins:opacity-100",
          open && "opacity-100",
        )}
      >
        <span className="grid size-4 place-items-center border border-line-strong bg-card"><Plus size={10} /></span>
        <span className="h-px flex-1 bg-line-strong" />
      </button>
      {open && <InsertMenu ctx={ctx} index={index} className="left-12 top-full" />}
    </div>
  );
}

function MenuList({ items, active, onPick, id }: { items: MenuItem[]; active: number; onPick: (m: MenuItem) => void; id: string }) {
  let group = "";
  return (
    <ul role="listbox" id={id} aria-label="Blocktypen" className="max-h-80 overflow-y-auto py-1">
      {items.length === 0 && <li className="px-3 py-3 text-sm text-muted">Kein passender Block.</li>}
      {items.map((m, i) => {
        const header = m.group !== group ? ((group = m.group), m.group) : null;
        return (
          <li key={m.key} role="presentation">
            {header && <p className="spec px-3 pb-1 pt-2.5" aria-hidden>{header}</p>}
            <button
              type="button"
              role="option"
              id={`${id}-${m.key}`}
              aria-selected={i === active}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(m)}
              className={cn("flex w-full items-start gap-3 px-3 py-2 text-left", i === active ? "bg-ink text-paper" : "hover:bg-sunken")}
            >
              <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center border", i === active ? "border-paper/30" : "border-line-strong")}>{m.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className={cn("block truncate text-xs", i === active ? "text-paper/70" : "text-muted")}>{m.hint}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function InsertMenu({ ctx, index, className }: { ctx: BlockCtx; index: number; className?: string }) {
  const id = useId();
  const m = ctx.menu?.mode === "insert" ? ctx.menu : null;
  const ref = useRef<HTMLDivElement>(null);
  const items = filterMenu(m?.query ?? "");
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && ctx.setMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [ctx]);
  if (!m) return null;
  const pick = (it: MenuItem) => {
    ctx.setMenu(null);
    ctx.insertAt(index, it.make());
  };
  return (
    <div ref={ref} className={cn("absolute z-40 w-80 border border-ink bg-card animate-rise", className)}>
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search size={14} className="text-muted" />
        <input
          autoFocus
          value={m.query}
          role="combobox"
          aria-expanded
          aria-controls={id}
          aria-activedescendant={items[m.active] ? `${id}-${items[m.active]!.key}` : undefined}
          aria-label="Blocktyp suchen"
          placeholder="Blocktyp suchen …"
          onChange={(e) => ctx.setMenu({ ...m, query: e.target.value, active: 0 })}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              ctx.setMenu({ ...m, active: Math.min(items.length - 1, m.active + 1) });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              ctx.setMenu({ ...m, active: Math.max(0, m.active - 1) });
            } else if (e.key === "Enter") {
              e.preventDefault();
              const it = items[m.active];
              if (it) pick(it);
            } else if (e.key === "Escape") {
              e.preventDefault();
              ctx.setMenu(null);
            }
          }}
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <MenuList items={items} active={m.active} onPick={pick} id={id} />
    </div>
  );
}

/* ─────────────────────────── Blockrahmen ─────────────────────────── */

function BlockShell({ block, index, count, ctx }: { block: ArticleBlock; index: number; count: number; ctx: BlockCtx }) {
  const onShellKey = (e: KeyboardEvent) => {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      ctx.move(block.id, e.key === "ArrowUp" ? -1 : 1);
    }
  };
  return (
    <div onKeyDown={onShellKey} className="group/block relative grid grid-cols-[2.5rem_1fr] gap-2 py-1.5 sm:grid-cols-[3rem_1fr]">
      <div className="pt-2.5 text-right">
        <span className="font-mono text-[10px] text-muted/80">{pad(index + 1)}</span>
        <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.08em] text-muted/60">{TYPE_LABEL[block.type]}</span>
      </div>
      <div className="relative min-w-0 border-l border-transparent pl-3 transition-colors focus-within:border-ink group-hover/block:border-line-strong">
        <div
          className="absolute -top-3 right-0 z-20 flex items-center border border-line-strong bg-card opacity-100 transition-opacity md:opacity-0 md:group-focus-within/block:opacity-100 md:group-hover/block:opacity-100"
          role="toolbar"
          aria-label={`Block ${index + 1} bearbeiten`}
        >
          <button type="button" onClick={() => ctx.move(block.id, -1)} disabled={index === 0} className="grid size-7 place-items-center hover:bg-sunken disabled:opacity-30" aria-label="Nach oben verschieben" title="Nach oben (Alt+↑)">
            <ArrowUp size={13} />
          </button>
          <button type="button" onClick={() => ctx.move(block.id, 1)} disabled={index === count - 1} className="grid size-7 place-items-center hover:bg-sunken disabled:opacity-30" aria-label="Nach unten verschieben" title="Nach unten (Alt+↓)">
            <ArrowDown size={13} />
          </button>
          <button type="button" onClick={() => ctx.remove(block.id)} className="grid size-7 place-items-center hover:bg-danger-soft hover:text-danger" aria-label="Block löschen">
            <Trash2 size={13} />
          </button>
        </div>
        <BlockBody block={block} index={index} ctx={ctx} />
      </div>
    </div>
  );
}

function BlockBody({ block, index, ctx }: { block: ArticleBlock; index: number; ctx: BlockCtx }) {
  switch (block.type) {
    case "paragraph":
      return <ParagraphBlock b={block} index={index} ctx={ctx} />;
    case "heading":
      return <HeadingBlock b={block} index={index} ctx={ctx} />;
    case "list":
      return <ListBlock b={block} index={index} ctx={ctx} />;
    case "quote":
      return <QuoteBlock b={block} ctx={ctx} />;
    case "callout":
      return <CalloutBlock b={block} ctx={ctx} />;
    case "image":
      return <ImageBlock b={block} ctx={ctx} />;
    case "gallery":
      return <GalleryBlock b={block} ctx={ctx} />;
    case "video":
      return <VideoBlock b={block} ctx={ctx} />;
    case "table":
      return <TableBlock b={block} ctx={ctx} />;
    case "divider":
      return (
        <button type="button" data-block-input={block.id} onKeyDown={(e) => e.key === "Backspace" && ctx.remove(block.id)} className="flex h-10 w-full items-center gap-4 text-muted outline-none" aria-label="Trennlinie (Rücktaste zum Entfernen)">
          <span className="h-px flex-1 bg-line-strong" />
          <span className="font-serif text-lg">§</span>
          <span className="h-px flex-1 bg-line-strong" />
        </button>
      );
    case "projectCard":
      return <EmbedBlock kind="project" id={block.projectId} title={block.title} blockKey={block.id} onPick={(id, title) => ctx.patch(block.id, { projectId: id, title })} />;
    case "tutorialCard":
      return <EmbedBlock kind="tutorial" id={block.tutorialId} title={block.title} blockKey={block.id} onPick={(id, title) => ctx.patch(block.id, { tutorialId: id, title })} />;
    case "productCard":
      return <EmbedBlock kind="product" id={block.productId} title={block.title} blockKey={block.id} onPick={(id, title) => ctx.patch(block.id, { productId: id, title })} />;
  }
}

/* ─────────────────────────── Textblöcke ─────────────────────────── */

const proseInput = "block w-full resize-none bg-transparent font-serif text-[1.1875rem] leading-[1.7] text-ink-2 outline-none placeholder:text-muted/60 field-sizing-content";

function wrapSelection(el: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const sel = value.slice(s, e) || placeholder;
  const text = value.slice(0, s) + before + sel + after + value.slice(e);
  return { text, start: s + before.length, end: s + before.length + sel.length };
}

function ParagraphBlock({ b, index, ctx }: { b: Of<"paragraph">; index: number; ctx: BlockCtx }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const slash = ctx.menu?.mode === "slash" && ctx.menu.blockId === b.id ? ctx.menu : null;
  const query = slash && b.text.startsWith("/") ? b.text.slice(1) : "";
  const items = slash ? filterMenu(query) : [];

  const applyWrap = (before: string, after: string, ph: string) => {
    const el = ref.current;
    if (!el) return;
    const r = wrapSelection(el, before, after, ph);
    ctx.patch(b.id, { text: r.text });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };
  const applyLink = () => {
    const href = url.trim();
    setLinkOpen(false);
    setUrl("");
    if (!href) return ref.current?.focus();
    const safe = /^(https?:\/\/|mailto:|\/)/i.test(href) ? href : `https://${href}`;
    applyWrap("[", `](${safe})`, "Linktext");
  };
  const pick = (it: MenuItem) => {
    ctx.setMenu(null);
    ctx.replace(b.id, it.make());
  };

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -top-3 left-0 z-10 flex opacity-0 transition-opacity group-focus-within/block:pointer-events-auto group-focus-within/block:opacity-100" role="toolbar" aria-label="Textauszeichnung">
        <div className="flex border border-line-strong bg-card">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyWrap("**", "**", "fett")} className="grid size-7 place-items-center hover:bg-sunken" aria-label="Fett (⌘B)" title="Fett (⌘B)"><Bold size={13} /></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyWrap("*", "*", "kursiv")} className="grid size-7 place-items-center hover:bg-sunken" aria-label="Kursiv (⌘I)" title="Kursiv (⌘I)"><Italic size={13} /></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setLinkOpen((o) => !o)} aria-expanded={linkOpen} className="grid size-7 place-items-center hover:bg-sunken" aria-label="Link (⌘K)" title="Link (⌘K)"><Link2 size={13} /></button>
        </div>
      </div>
      <label htmlFor={`p-${b.id}`} className="sr-only">Absatz {index + 1}</label>
      <textarea
        ref={ref}
        id={`p-${b.id}`}
        data-block-input={b.id}
        value={b.text}
        rows={1}
        placeholder={index === 0 ? "Erzähl deine Geschichte … (/ für Blöcke)" : "Schreiben oder / für Blöcke"}
        role={slash ? "combobox" : undefined}
        aria-expanded={slash ? true : undefined}
        aria-controls={slash ? listId : undefined}
        aria-activedescendant={slash && items[slash.active] ? `${listId}-${items[slash.active]!.key}` : undefined}
        onChange={(e) => {
          const v = e.target.value;
          ctx.patch(b.id, { text: v });
          if (v === "/" && !slash) ctx.setMenu({ mode: "slash", blockId: b.id, active: 0 });
          else if (slash && (!v.startsWith("/") || /\s/.test(v))) ctx.setMenu(null);
          else if (slash) ctx.setMenu({ ...slash, active: 0 });
        }}
        onBlur={() => slash && setTimeout(() => ctx.setMenu(null), 120)}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          const mod = e.metaKey || e.ctrlKey;
          if (slash) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              return ctx.setMenu({ ...slash, active: Math.min(items.length - 1, slash.active + 1) });
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              return ctx.setMenu({ ...slash, active: Math.max(0, slash.active - 1) });
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const it = items[slash.active];
              return it ? pick(it) : ctx.setMenu(null);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              return ctx.setMenu(null);
            }
          }
          if (mod && e.key.toLowerCase() === "b") {
            e.preventDefault();
            return applyWrap("**", "**", "fett");
          }
          if (mod && e.key.toLowerCase() === "i") {
            e.preventDefault();
            return applyWrap("*", "*", "kursiv");
          }
          if (mod && e.key.toLowerCase() === "k") {
            e.preventDefault();
            return setLinkOpen(true);
          }
          if (e.key === "Enter" && !e.shiftKey && !mod && !e.altKey) {
            e.preventDefault();
            const before = el.value.slice(0, el.selectionStart);
            const after = el.value.slice(el.selectionEnd);
            ctx.patch(b.id, { text: before });
            ctx.insertAt(index + 1, { id: blockId(), type: "paragraph", text: after });
            return;
          }
          if (e.key === "Backspace" && el.value === "" && ctx.blocks.length > 1) {
            e.preventDefault();
            return ctx.remove(b.id);
          }
          if (e.key === "ArrowUp" && !e.altKey && el.selectionStart === 0 && el.selectionEnd === 0) {
            e.preventDefault();
            return ctx.focusNeighbour(b.id, -1);
          }
          if (e.key === "ArrowDown" && !e.altKey && el.selectionStart === el.value.length) {
            e.preventDefault();
            return ctx.focusNeighbour(b.id, 1);
          }
        }}
        className={cn(proseInput, "min-h-[1.7em] py-1.5")}
      />
      {linkOpen && (
        <div className="mt-1 flex items-center gap-2 border border-ink bg-card px-2 animate-fade">
          <Link2 size={13} className="text-muted" />
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                setLinkOpen(false);
                ref.current?.focus();
              }
            }}
            aria-label="Link-Adresse"
            placeholder="https://… – Enter zum Einfügen"
            className="h-9 flex-1 bg-transparent text-sm outline-none"
          />
          <button type="button" onClick={applyLink} className="text-xs font-semibold">Einfügen</button>
        </div>
      )}
      {slash && (
        <div className="absolute left-0 top-full z-40 mt-1 w-80 border border-ink bg-card animate-rise">
          <p className="spec border-b border-line px-3 py-2">Block einfügen{query ? ` · „${query}“` : ""}</p>
          <MenuList items={items} active={slash.active} onPick={pick} id={listId} />
        </div>
      )}
    </div>
  );
}

function HeadingBlock({ b, index, ctx }: { b: Of<"heading">; index: number; ctx: BlockCtx }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-2 flex shrink-0 border border-line-strong" role="group" aria-label="Ebene">
        {([2, 3] as const).map((l) => (
          <button key={l} type="button" aria-pressed={b.level === l} onClick={() => ctx.patch(b.id, { level: l })} className={cn("h-6 px-1.5 font-mono text-[10px]", b.level === l ? "bg-ink text-paper" : "text-muted hover:text-ink")}>
            H{l}
          </button>
        ))}
      </div>
      <input
        data-block-input={b.id}
        value={b.text}
        aria-label={`Überschrift ${index + 1}`}
        placeholder={b.level === 2 ? "Überschrift" : "Zwischentitel"}
        maxLength={200}
        onChange={(e) => ctx.patch(b.id, { text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            ctx.insertAt(index + 1, { id: blockId(), type: "paragraph", text: "" });
          } else if (e.key === "Backspace" && e.currentTarget.value === "") {
            e.preventDefault();
            ctx.replace(b.id, { id: b.id, type: "paragraph", text: "" });
          } else if (e.key === "ArrowUp" && !e.altKey) {
            e.preventDefault();
            ctx.focusNeighbour(b.id, -1);
          } else if (e.key === "ArrowDown" && !e.altKey) {
            e.preventDefault();
            ctx.focusNeighbour(b.id, 1);
          }
        }}
        className={cn(
          "w-full bg-transparent text-ink outline-none placeholder:text-muted/50",
          b.level === 2 ? "font-serif text-[1.6rem] font-[520] leading-tight py-1" : "py-2 text-[1.05rem] font-bold",
        )}
      />
    </div>
  );
}

function ListBlock({ b, index, ctx }: { b: Of<"list">; index: number; ctx: BlockCtx }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusItem, setFocusItem] = useState<number | null>(null);
  useEffect(() => {
    if (focusItem == null) return;
    refs.current[focusItem]?.focus();
    setFocusItem(null);
  }, [focusItem, b.items]);
  const setItems = (items: string[]) => ctx.patch(b.id, { items });
  return (
    <div>
      <div className="mb-1 flex gap-1" role="group" aria-label="Listentyp">
        <button type="button" aria-pressed={!b.ordered} onClick={() => ctx.patch(b.id, { ordered: false })} className={cn("inline-flex h-6 items-center gap-1 px-1.5 text-[11px]", !b.ordered ? "bg-ink text-paper" : "text-muted hover:text-ink")}>
          <List size={12} /> Striche
        </button>
        <button type="button" aria-pressed={b.ordered} onClick={() => ctx.patch(b.id, { ordered: true })} className={cn("inline-flex h-6 items-center gap-1 px-1.5 text-[11px]", b.ordered ? "bg-ink text-paper" : "text-muted hover:text-ink")}>
          <ListOrdered size={12} /> Nummeriert
        </button>
      </div>
      <ul className="space-y-0.5">
        {b.items.map((it, i) => (
          <li key={i} className="flex items-baseline gap-3">
            <span className="w-6 shrink-0 text-right font-mono text-xs text-muted" aria-hidden>{b.ordered ? `${pad(i + 1)}` : "—"}</span>
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-block-input={i === 0 ? b.id : undefined}
              value={it}
              aria-label={`Listenpunkt ${i + 1}`}
              placeholder="Listenpunkt"
              onChange={(e) => setItems(b.items.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!it.trim() && i === b.items.length - 1 && b.items.length > 1) {
                    setItems(b.items.slice(0, -1));
                    ctx.insertAt(index + 1, { id: blockId(), type: "paragraph", text: "" });
                    return;
                  }
                  const next = [...b.items];
                  next.splice(i + 1, 0, "");
                  setItems(next);
                  setFocusItem(i + 1);
                } else if (e.key === "Backspace" && !it) {
                  e.preventDefault();
                  if (b.items.length === 1) return ctx.remove(b.id);
                  setItems(b.items.filter((_, j) => j !== i));
                  setFocusItem(Math.max(0, i - 1));
                } else if (e.key === "ArrowUp" && !e.altKey) {
                  e.preventDefault();
                  if (i === 0) ctx.focusNeighbour(b.id, -1);
                  else setFocusItem(i - 1);
                } else if (e.key === "ArrowDown" && !e.altKey) {
                  e.preventDefault();
                  if (i === b.items.length - 1) ctx.focusNeighbour(b.id, 1);
                  else setFocusItem(i + 1);
                }
              }}
              className="w-full bg-transparent py-1 font-serif text-[1.125rem] text-ink-2 outline-none placeholder:text-muted/50"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuoteBlock({ b, ctx }: { b: Of<"quote">; ctx: BlockCtx }) {
  return (
    <div className="border-l-2 border-clay pl-4">
      <textarea data-block-input={b.id} value={b.text} rows={1} maxLength={3000} aria-label="Zitat" placeholder="Zitat" onChange={(e) => ctx.patch(b.id, { text: e.target.value })} className={cn(proseInput, "italic text-ink")} />
      <input value={b.cite} maxLength={200} aria-label="Quelle des Zitats" placeholder="— Quelle (optional)" onChange={(e) => ctx.patch(b.id, { cite: e.target.value })} className="mt-1 w-full bg-transparent text-sm text-muted outline-none" />
    </div>
  );
}

const TONES = [
  { key: "info", label: "Info", icon: <Info size={12} />, cls: "border-line-strong bg-sunken" },
  { key: "tip", label: "Tipp", icon: <Lightbulb size={12} />, cls: "border-moss/40 bg-moss-soft" },
  { key: "warning", label: "Warnung", icon: <TriangleAlert size={12} />, cls: "border-warn/40 bg-warn-soft" },
] as const;

function CalloutBlock({ b, ctx }: { b: Of<"callout">; ctx: BlockCtx }) {
  const tone = TONES.find((t) => t.key === b.tone) ?? TONES[0];
  return (
    <div className={cn("border-l-2 px-4 py-3", tone.cls)}>
      <div className="mb-1 flex gap-1" role="group" aria-label="Art des Hinweises">
        {TONES.map((t) => (
          <button key={t.key} type="button" aria-pressed={b.tone === t.key} onClick={() => ctx.patch(b.id, { tone: t.key })} className={cn("inline-flex h-6 items-center gap-1 px-1.5 text-[11px] font-semibold", b.tone === t.key ? "bg-ink text-paper" : "text-muted hover:text-ink")}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <textarea data-block-input={b.id} value={b.text} rows={1} maxLength={3000} aria-label="Hinweistext" placeholder="Was sollten Lesende unbedingt wissen?" onChange={(e) => ctx.patch(b.id, { text: e.target.value })} className="block w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none field-sizing-content placeholder:text-muted/60" />
    </div>
  );
}

/* ─────────────────────────── Medienblöcke ─────────────────────────── */

function useUpload() {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(file: File) {
    setError(null);
    setProgress(0);
    try {
      const r = await uploadFile(file, "public", setProgress);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
      return null;
    } finally {
      setProgress(null);
    }
  }
  return { run, progress, error };
}

const variantUrl = (v: Record<string, string> | undefined, fallback: string) => v?.lg ?? v?.md ?? v?.sm ?? fallback;

function UploadDrop({ blockKey, accept, label, onFiles, progress, multiple }: { blockKey?: string; accept: string; label: string; onFiles: (f: File[]) => void; progress: number | null; multiple?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        data-block-input={blockKey}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(Array.from(e.dataTransfer.files));
        }}
        disabled={progress !== null}
        className="crop flex h-40 w-full flex-col items-center justify-center gap-2 border border-dashed border-line-strong bg-card text-sm text-muted hover:border-ink hover:text-ink"
      >
        {progress !== null ? (
          <>
            <LoaderCircle size={18} className="animate-spin" />
            <span className="font-mono text-xs num">{Math.round(progress * 100)} %</span>
            <span className="h-px w-40 bg-line"><span className="block h-px bg-moss" style={{ width: `${Math.round(progress * 100)}%` }} /></span>
          </>
        ) : (
          <>
            <ImagePlus size={20} strokeWidth={1.5} />
            <span className="font-semibold">{label}</span>
            <span className="text-xs">oder Datei hierher ziehen</span>
          </>
        )}
      </button>
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))} />
    </>
  );
}

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/avif";

function ImageBlock({ b, ctx }: { b: Of<"image">; ctx: BlockCtx }) {
  const up = useUpload();
  const [preview, setPreview] = useState<string | null>(null);
  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    const r = await up.run(f);
    if (r) ctx.patch(b.id, { mediaId: r.mediaId, url: variantUrl(r.variants, "") });
  };
  const src = b.url || preview;
  return (
    <figure>
      {b.mediaId && src ? (
        <div className="relative border border-line bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={b.alt} className="block max-h-[28rem] w-full object-contain" />
          <button type="button" onClick={() => ctx.patch(b.id, { mediaId: "", url: "" })} className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 bg-card px-2 text-xs font-semibold hover:bg-sunken">
            Ersetzen
          </button>
        </div>
      ) : (
        <UploadDrop blockKey={b.id} accept={IMAGE_ACCEPT} label="Bild hochladen" onFiles={onFiles} progress={up.progress} />
      )}
      {up.error && <p role="alert" className="mt-1 text-xs text-danger">{up.error}</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input value={b.alt} maxLength={500} onChange={(e) => ctx.patch(b.id, { alt: e.target.value })} aria-label="Alt-Text" placeholder="Alt-Text: Was ist zu sehen?" className={cn("h-9 border-b bg-transparent text-sm outline-none focus:border-ink", b.mediaId && !b.alt.trim() ? "border-warn" : "border-line")} />
        <input value={b.caption} maxLength={500} onChange={(e) => ctx.patch(b.id, { caption: e.target.value })} aria-label="Bildunterschrift" placeholder="Bildunterschrift (optional)" className="h-9 border-b border-line bg-transparent text-sm outline-none focus:border-ink" />
      </div>
    </figure>
  );
}

function GalleryBlock({ b, ctx }: { b: Of<"gallery">; ctx: BlockCtx }) {
  const up = useUpload();
  const imagesRef = useRef(b.images);
  imagesRef.current = b.images;
  const set = (images: Of<"gallery">["images"]) => ctx.patch(b.id, { images });
  const onFiles = async (files: File[]) => {
    for (const f of files.slice(0, 24 - imagesRef.current.length)) {
      const r = await up.run(f);
      if (r) set([...imagesRef.current, { mediaId: r.mediaId, url: variantUrl(r.variants, URL.createObjectURL(f)), alt: "", caption: "" }]);
    }
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= b.images.length) return;
    const next = [...b.images];
    [next[i], next[j]] = [next[j]!, next[i]!];
    set(next);
  };
  return (
    <div>
      {b.images.length > 0 && (
        <ol className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {b.images.map((img, i) => (
            <li key={img.mediaId} className="group/img border border-line bg-card">
              <div className="relative aspect-square overflow-hidden bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-1.5 top-1.5 bg-ink px-1.5 font-mono text-[10px] text-paper">{pad(i + 1)}</span>
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-focus-within/img:opacity-100 group-hover/img:opacity-100">
                  <button type="button" onClick={() => move(i, -1)} className="grid size-7 place-items-center bg-card" aria-label={`Bild ${i + 1} nach vorne`}><ArrowLeft size={13} /></button>
                  <button type="button" onClick={() => move(i, 1)} className="grid size-7 place-items-center bg-card" aria-label={`Bild ${i + 1} nach hinten`}><ArrowRight size={13} /></button>
                  <button type="button" onClick={() => set(b.images.filter((_, j) => j !== i))} className="grid size-7 place-items-center bg-card" aria-label={`Bild ${i + 1} entfernen`}><X size={13} /></button>
                </div>
              </div>
              <input value={img.alt} maxLength={500} onChange={(e) => set(b.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} aria-label={`Alt-Text für Bild ${i + 1}`} placeholder="Alt-Text" className="h-8 w-full border-t border-line px-2 text-[12px] outline-none focus:bg-sunken" />
              <input value={img.caption} maxLength={500} onChange={(e) => set(b.images.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} aria-label={`Bildunterschrift für Bild ${i + 1}`} placeholder="Unterschrift" className="h-8 w-full border-t border-line px-2 text-[12px] outline-none focus:bg-sunken" />
            </li>
          ))}
        </ol>
      )}
      {b.images.length < 24 && <UploadDrop blockKey={b.images.length === 0 ? b.id : undefined} accept={IMAGE_ACCEPT} label={b.images.length ? "Weitere Bilder hinzufügen" : "Bilder für die Galerie hochladen"} onFiles={onFiles} progress={up.progress} multiple />}
      {up.error && <p role="alert" className="mt-1 text-xs text-danger">{up.error}</p>}
    </div>
  );
}

function VideoBlock({ b, ctx }: { b: Of<"video">; ctx: BlockCtx }) {
  const up = useUpload();
  const [preview, setPreview] = useState<string | null>(null);
  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    const r = await up.run(f);
    if (r) ctx.patch(b.id, { mediaId: r.mediaId, url: r.variants?.video ?? "" });
  };
  const src = b.url || preview;
  return (
    <figure>
      {b.mediaId ? (
        <div className="relative border border-line bg-ink">
          {src ? <video src={src} controls playsInline preload="metadata" className="block max-h-[28rem] w-full" aria-label={b.caption || "Video"} /> : <p className="px-4 py-10 text-center text-sm text-paper/80">Video wird verarbeitet …</p>}
          <button type="button" onClick={() => ctx.patch(b.id, { mediaId: "", url: "" })} className="absolute right-2 top-2 inline-flex h-7 items-center bg-card px-2 text-xs font-semibold">Ersetzen</button>
        </div>
      ) : (
        <UploadDrop blockKey={b.id} accept="video/mp4,video/quicktime,video/webm" label="Video hochladen (max. 3 Min.)" onFiles={onFiles} progress={up.progress} />
      )}
      {up.error && <p role="alert" className="mt-1 text-xs text-danger">{up.error}</p>}
      <input value={b.caption} maxLength={500} onChange={(e) => ctx.patch(b.id, { caption: e.target.value })} aria-label="Videobeschreibung" placeholder="Beschreibung (optional, hilft auch Screenreadern)" className="mt-2 h-9 w-full border-b border-line bg-transparent text-sm outline-none focus:border-ink" />
    </figure>
  );
}

/* ─────────────────────────── Tabelle ─────────────────────────── */

function TableBlock({ b, ctx }: { b: Of<"table">; ctx: BlockCtx }) {
  const cols = Math.max(...b.rows.map((r) => r.length));
  const set = (rows: string[][]) => ctx.patch(b.id, { rows });
  const setCell = (r: number, c: number, v: string) => set(b.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  return (
    <div>
      <div className="overflow-x-auto border border-line">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {b.rows.map((row, r) => (
              <tr key={r} className={cn(r === 0 && "bg-sunken")}>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="border-b border-r border-line p-0 last:border-r-0">
                    <input
                      data-block-input={r === 0 && c === 0 ? b.id : undefined}
                      value={row[c] ?? ""}
                      maxLength={500}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      aria-label={`${r === 0 ? "Kopfzeile" : `Zeile ${r}`}, Spalte ${c + 1}`}
                      placeholder={r === 0 ? `Spalte ${c + 1}` : ""}
                      className={cn("h-9 w-full min-w-24 bg-transparent px-2 outline-none focus:bg-moss-soft", r === 0 && "font-semibold")}
                    />
                  </td>
                ))}
                <td className="w-8 border-b border-line p-0">
                  {b.rows.length > 1 && (
                    <button type="button" onClick={() => set(b.rows.filter((_, i) => i !== r))} className="grid size-9 place-items-center text-muted hover:text-danger" aria-label={`Zeile ${r + 1} entfernen`}><X size={12} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <button type="button" disabled={b.rows.length >= 60} onClick={() => set([...b.rows, Array(cols).fill("")])} className="inline-flex h-7 items-center gap-1 border border-line-strong px-2 font-semibold hover:border-ink disabled:opacity-40"><Plus size={12} /> Zeile</button>
        <button type="button" disabled={cols >= 8} onClick={() => set(b.rows.map((r) => [...r, ""]))} className="inline-flex h-7 items-center gap-1 border border-line-strong px-2 font-semibold hover:border-ink disabled:opacity-40"><Plus size={12} /> Spalte</button>
        <button type="button" disabled={cols <= 1} onClick={() => set(b.rows.map((r) => r.slice(0, cols - 1)))} className="inline-flex h-7 items-center gap-1 border border-line-strong px-2 hover:border-ink disabled:opacity-40"><Minus size={12} /> Letzte Spalte</button>
        <span className="self-center text-muted">Erste Zeile = Kopfzeile</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── Einbettungen ─────────────────────────── */

type EmbedHit = { id: string; title: string; meta: string; coverUrl: string | null; category: string | null };
const EMBED_LABEL = { project: "Projekt", tutorial: "Anleitung", product: "Produkt" } as const;

function EmbedBlock({ kind, id, title, blockKey, onPick }: { kind: "project" | "tutorial" | "product"; id: string; title?: string; blockKey: string; onPick: (id: string, title: string) => void }) {
  const [editing, setEditing] = useState(!id);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<EmbedHit[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!editing) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/embeds?type=${kind}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error?.message ?? "Suche fehlgeschlagen");
        setHits(j.data as EmbedHit[]);
        setActive(0);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, kind, editing]);

  const choose = (h: EmbedHit) => {
    onPick(h.id, h.title);
    setEditing(false);
  };

  if (!editing && id) {
    return (
      <div className="flex items-center gap-3 border border-line bg-card px-3 py-2.5">
        <span className="h-8 w-px bg-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="spec">{EMBED_LABEL[kind]}karte</p>
          <p className="truncate font-semibold">{title ?? "Ausgewählt"}</p>
        </div>
        <button type="button" data-block-input={blockKey} onClick={() => setEditing(true)} className="text-xs font-semibold text-muted hover:text-ink">Ändern</button>
      </div>
    );
  }

  const list = hits ?? [];
  return (
    <div className="border border-ink bg-card">
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search size={14} className="text-muted" />
        <input
          data-block-input={blockKey}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          role="combobox"
          aria-expanded={list.length > 0}
          aria-controls={listId}
          aria-activedescendant={list[active] ? `${listId}-${list[active]!.id}` : undefined}
          aria-label={`Eigene ${EMBED_LABEL[kind] === "Anleitung" ? "Anleitungen" : EMBED_LABEL[kind] + "e"} durchsuchen`}
          placeholder={`${EMBED_LABEL[kind]} suchen …`}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(list.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const h = list[active];
              if (h) choose(h);
            } else if (e.key === "Escape" && id) setEditing(false);
          }}
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
        {id && <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:text-ink">Abbrechen</button>}
      </div>
      {error && <p role="alert" className="px-3 py-2 text-xs text-danger">{error}</p>}
      <ul role="listbox" id={listId} aria-label="Treffer" className="max-h-64 overflow-y-auto">
        {hits === null && <li className="spec px-3 py-3">Suche …</li>}
        {hits?.length === 0 && <li className="px-3 py-3 text-sm text-muted">Keine eigenen {EMBED_LABEL[kind] === "Anleitung" ? "Anleitungen" : `${EMBED_LABEL[kind]}e`} gefunden.</li>}
        {list.map((h, i) => (
          <li key={h.id} role="presentation">
            <button
              type="button"
              role="option"
              id={`${listId}-${h.id}`}
              aria-selected={i === active}
              tabIndex={-1}
              onClick={() => choose(h)}
              className={cn("flex w-full items-center gap-3 px-3 py-2 text-left", i === active ? "bg-sunken" : "hover:bg-sunken")}
            >
              <span className="relative size-10 shrink-0 overflow-hidden border border-line">
                {h.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <Plate seed={h.id} category={h.category} number={false} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{h.title}</span>
                <span className="spec">{h.meta}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
