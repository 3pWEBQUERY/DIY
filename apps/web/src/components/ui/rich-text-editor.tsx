"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Italic, Link2, List, ListOrdered, Unlink } from "lucide-react";
import { markupHref, parseInline, safeHref, type Inline } from "@/lib/inline-marks";
import { parseRichBlocks } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/**
 * WYSIWYG-Editor für Produktbeschreibung, Sicherheitshinweise und Rückgabe: fett, kursiv, Aufzählungen,
 * nummerierte Listen und Links – direkt so formatiert, wie es später auf der Produktseite steht.
 * Gespeichert wird die schlanke Auszeichnung aus src/lib/rich-text.ts (nie HTML). Eingefügter Text
 * kommt ohne fremde Formatierung an.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlineToHtml(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "text":
          return esc(n.v);
        case "br":
          return "<br>";
        case "b":
          return `<b>${inlineToHtml(n.c)}</b>`;
        case "i":
          return `<i>${inlineToHtml(n.c)}</i>`;
        case "a":
          return `<a href="${esc(n.href)}">${inlineToHtml(n.c)}</a>`;
      }
    })
    .join("");
}

/** Auszeichnung → HTML für den Editor (jede Zeile ein Block, Leerzeile = leerer Block). */
export function markupToEditorHtml(src: string): string {
  if (!src.trim()) return "";
  const out: string[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  // Absätze zeilenweise, Listen als Ganzes – Leerzeilen zwischen Absätzen bleiben erhalten
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const blocks = parseRichBlocks(line);
    const b = blocks[0];
    if (b && b.t !== "p") {
      const tag = b.t;
      const items: string[] = [];
      while (i < lines.length) {
        const bb = parseRichBlocks(lines[i]!)[0];
        if (!bb || bb.t !== tag) break;
        items.push(...bb.items);
        i++;
      }
      out.push(`<${tag}>${items.map((it) => `<li>${inlineToHtml(parseInline(it))}</li>`).join("")}</${tag}>`);
      continue;
    }
    out.push(line.trim() ? `<div>${inlineToHtml(parseInline(line))}</div>` : "<div><br></div>");
    i++;
  }
  return out.join("");
}

const escMarkup = (s: string) => s.replace(/([\\*[\]()])/g, "\\$1");

function wrap(inner: string, mark: string) {
  const lead = /^\s*/.exec(inner)![0];
  const trail = /\s*$/.exec(inner)![0];
  const core = inner.slice(lead.length, inner.length - trail.length);
  return core ? `${lead}${mark}${core}${mark}${trail}` : inner;
}

function inlineToMarkup(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escMarkup((node.textContent ?? "").replace(/ /g, " "));
  if (!(node instanceof HTMLElement)) return "";
  const kids = () => Array.from(node.childNodes).map(inlineToMarkup).join("");
  const tag = node.tagName;
  if (tag === "BR") return "\n";
  const weight = node.style.fontWeight;
  const bold = tag === "B" || tag === "STRONG" || weight === "bold" || Number(weight) >= 600;
  const italic = tag === "I" || tag === "EM" || node.style.fontStyle === "italic";
  if (tag === "A") {
    const href = safeHref(node.getAttribute("href") ?? "");
    const text = kids();
    return href && text.trim() ? `[${text}](${markupHref(href)})` : text;
  }
  let s = kids();
  if (italic) s = wrap(s, "*");
  if (bold) s = wrap(s, "**");
  return s;
}

const BLOCK = /^(DIV|P|H[1-6]|BLOCKQUOTE|UL|OL)$/;

/** Editor-DOM → Auszeichnung. Browser verschachteln Blöcke unterschiedlich (z. B. Liste in einem div). */
export function editorToMarkup(root: HTMLElement): string {
  const lines: string[] = [];
  const walk = (container: Node) => {
    let current = "";
    let open = false;
    const flush = () => {
      if (open) lines.push(current.replace(/\n$/, ""));
      current = "";
      open = false;
    };
    for (const node of Array.from(container.childNodes)) {
      if (node instanceof HTMLElement && (node.tagName === "UL" || node.tagName === "OL")) {
        flush();
        let k = 0;
        for (const li of Array.from(node.children).filter((c) => c.tagName === "LI")) {
          k++;
          const text = Array.from(li.childNodes)
            .filter((c) => !(c instanceof HTMLElement && (c.tagName === "UL" || c.tagName === "OL")))
            .map(inlineToMarkup)
            .join("")
            .replace(/\n+/g, " ")
            .trim();
          if (text) lines.push(node.tagName === "UL" ? `- ${text}` : `${k}. ${text}`);
        }
        continue;
      }
      if (node instanceof HTMLElement && BLOCK.test(node.tagName)) {
        flush();
        // Block mit weiteren Blöcken darin (z. B. <div><ul>…</ul></div>) → hineinsteigen
        if (Array.from(node.children).some((c) => BLOCK.test(c.tagName))) walk(node);
        // Ein Block ist eine Zeile; der abschliessende <br> ist nur Platzhalter des Browsers
        else lines.push(inlineToMarkup(node).replace(/\n$/, ""));
        continue;
      }
      current += inlineToMarkup(node);
      open = true;
    }
    flush();
  };
  walk(root);
  // Mehrfache Leerzeilen zusammenfassen, Rand säubern
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

type Props = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  minHeight?: number;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

const TOOLS = [
  { cmd: "bold", label: "Fett", icon: Bold, key: "B" },
  { cmd: "italic", label: "Kursiv", icon: Italic, key: "I" },
  { cmd: "insertUnorderedList", label: "Aufzählung", icon: List },
  { cmd: "insertOrderedList", label: "Nummerierte Liste", icon: ListOrdered },
] as const;

export function RichTextEditor({ id, value, onChange, placeholder, maxLength, minHeight = 120, ...aria }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(!value.trim());

  // Wert von aussen (Laden, Zurücksetzen) übernehmen – eigene Eingaben nicht überschreiben (Cursor bleibt)
  useEffect(() => {
    const el = ref.current;
    if (!el || value === emitted.current) return;
    el.innerHTML = markupToEditorHtml(value);
    emitted.current = value;
    setEmpty(!value.trim());
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const md = editorToMarkup(el);
    emitted.current = md;
    setEmpty(!md && !el.textContent?.trim());
    onChange(md);
  }, [onChange]);

  const refreshActive = useCallback(() => {
    const el = ref.current;
    const sel = document.getSelection();
    if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
    const next: Record<string, boolean> = {};
    for (const t of TOOLS) {
      try {
        next[t.cmd] = document.queryCommandState(t.cmd);
      } catch {
        next[t.cmd] = false;
      }
    }
    let n: Node | null = sel.anchorNode;
    while (n && n !== el && !(n instanceof HTMLAnchorElement)) n = n.parentNode;
    next.link = n instanceof HTMLAnchorElement;
    setActive(next);
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshActive);
    return () => document.removeEventListener("selectionchange", refreshActive);
  }, [refreshActive]);

  const run = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
    refreshActive();
  };

  const openLink = () => {
    const sel = document.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
    setLinkUrl("");
    setLinkError(null);
    setLinkOpen(true);
  };

  const applyLink = () => {
    const raw = linkUrl.trim();
    const href = safeHref(/^[a-z]+:|^\//i.test(raw) ? raw : `https://${raw}`);
    if (!href) {
      setLinkError("Bitte eine gültige Adresse eingeben (https://…).");
      return;
    }
    const el = ref.current;
    const sel = document.getSelection();
    el?.focus();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (sel && sel.isCollapsed) document.execCommand("insertText", false, raw);
    // Gerade eingefügten Text auswählen, damit er zum Link wird
    if (sel && sel.isCollapsed && sel.anchorNode) {
      const r = document.createRange();
      r.setStart(sel.anchorNode, Math.max(0, sel.anchorOffset - raw.length));
      r.setEnd(sel.anchorNode, sel.anchorOffset);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    document.execCommand("createLink", false, href);
    sel?.collapseToEnd();
    setLinkOpen(false);
    emit();
  };

  const length = emitted.current?.length ?? value.length;

  return (
    <div className="rounded-xl border border-field bg-card transition-colors focus-within:border-moss hover:border-muted has-[[aria-invalid=true]]:border-danger">
      <div role="toolbar" aria-label="Formatierung" className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
        {TOOLS.map((t) => (
          <button
            key={t.cmd}
            type="button"
            title={"key" in t ? `${t.label} (⌘/Strg + ${t.key})` : t.label}
            aria-label={t.label}
            aria-pressed={!!active[t.cmd]}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(t.cmd)}
            className={cn("grid size-8 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-sunken hover:text-ink", active[t.cmd] && "bg-moss-soft text-moss-ink")}
          >
            <t.icon size={16} strokeWidth={2.2} aria-hidden />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        {active.link ? (
          <button type="button" title="Link entfernen" aria-label="Link entfernen" onMouseDown={(e) => e.preventDefault()} onClick={() => run("unlink")} className="grid size-8 place-items-center rounded-lg bg-moss-soft text-moss-ink">
            <Unlink size={16} strokeWidth={2.2} aria-hidden />
          </button>
        ) : (
          <button type="button" title="Link einfügen" aria-label="Link einfügen" aria-expanded={linkOpen} onMouseDown={(e) => e.preventDefault()} onClick={openLink} className="grid size-8 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-sunken hover:text-ink">
            <Link2 size={16} strokeWidth={2.2} aria-hidden />
          </button>
        )}
        {maxLength && length > maxLength * 0.8 && (
          <span className={cn("ml-auto pr-1.5 font-mono text-[11px]", length > maxLength ? "text-danger" : "text-muted")} aria-live="polite">
            {length}/{maxLength}
          </span>
        )}
      </div>
      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-3 py-2">
          <input
            autoFocus
            type="url"
            inputMode="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkOpen(false);
            }}
            placeholder="https://…"
            aria-label="Linkadresse"
            className="h-9 min-w-0 flex-1 rounded-lg border border-field bg-card px-2.5 text-[14px] focus:border-moss focus:outline-none"
          />
          <button type="button" onClick={applyLink} className="h-9 rounded-lg bg-ink px-3 text-[13px] font-semibold text-paper">
            Übernehmen
          </button>
          <button type="button" onClick={() => setLinkOpen(false)} className="h-9 rounded-lg px-2 text-[13px] font-semibold text-muted hover:text-ink">
            Abbrechen
          </button>
          {linkError && <p className="w-full text-[12.5px] font-medium text-danger">{linkError}</p>}
        </div>
      )}
      <div className="relative">
        {empty && placeholder && (
          <p aria-hidden className="pointer-events-none absolute left-3 top-2.5 text-[15px] text-muted">
            {placeholder}
          </p>
        )}
        <div
          ref={ref}
          id={id}
          role="textbox"
          aria-multiline="true"
          aria-labelledby={id ? `${id}-label` : undefined}
          aria-describedby={aria["aria-describedby"]}
          aria-invalid={aria["aria-invalid"]}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onFocus={() => {
            try {
              document.execCommand("defaultParagraphSeparator", false, "div");
            } catch {
              /* ältere Browser */
            }
          }}
          onInput={emit}
          onBlur={emit}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
              e.preventDefault();
              openLink();
            }
          }}
          onPaste={(e) => {
            // Nur reinen Text übernehmen – keine fremden Schriften, Farben oder Skripte
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          onDrop={(e) => e.preventDefault()}
          className="max-w-none px-3 py-2.5 text-[15px] leading-relaxed text-ink outline-none [&_a]:text-moss-ink [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}
