"use client";

import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: ReactNode; text: string; disabled?: boolean };
type ChangeEvent = { target: HTMLInputElement; currentTarget: HTMLInputElement };

export type SelectProps = Omit<ComponentProps<"select">, "onChange" | "ref"> & {
  onChange?: (e: ChangeEvent) => void;
  placeholder?: string;
};

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function collect(children: ReactNode, out: Opt[] = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (el.type === "option") {
      const label = el.props.children;
      out.push({ value: String(el.props.value ?? textOf(label)), label, text: textOf(label), disabled: el.props.disabled });
    } else if (el.props.children) collect(el.props.children, out);
  });
  return out;
}

/**
 * Eigenes Auswahlfeld im Werkraum-Stil – ersetzt das native <select> vollständig.
 * Drop-in: gleiche Props (value/defaultValue/name/disabled/onChange mit e.target.value),
 * funktioniert in Formularen (verstecktes Input), per Tastatur bedienbar (WAI-ARIA Listbox).
 */
export const Select = forwardRef<HTMLInputElement, SelectProps>(function Select(
  { children, value, defaultValue, onChange, name, disabled, className, id, placeholder, required, form, ...rest },
  ref,
) {
  const options = useMemo(() => collect(children), [children]);
  const controlled = value !== undefined;
  const [inner, setInner] = useState<string>(() => String(defaultValue ?? options[0]?.value ?? ""));
  const current = controlled ? String(value ?? "") : inner;
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const typed = useRef({ q: "", t: 0 });
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;

  useImperativeHandle(ref, () => hidden.current!, []);

  // Uncontrolled: externen defaultValue-Wechsel übernehmen (z. B. nach Navigation)
  useEffect(() => {
    if (!controlled && defaultValue !== undefined) setInner(String(defaultValue));
  }, [defaultValue, controlled]);

  const place = useCallback(() => {
    const b = button.current?.getBoundingClientRect();
    if (!b) return;
    const room = window.innerHeight - b.bottom;
    const h = Math.min(300, options.length * 40 + 12);
    const up = room < h + 12 && b.top > room;
    setPos({ top: up ? b.top - 6 : b.bottom + 6, left: b.left, width: Math.max(b.width, 220), up });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!button.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function commit(v: string) {
    if (!controlled) setInner(v);
    setOpen(false);
    button.current?.focus();
    if (hidden.current) {
      hidden.current.value = v;
      onChange?.({ target: hidden.current, currentTarget: hidden.current });
    }
  }

  function openList() {
    if (disabled) return;
    const i = Math.max(0, options.findIndex((o) => o.value === current));
    setActive(i);
    setOpen(true);
  }

  function move(delta: number) {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + delta + options.length) % options.length;
      if (!options[i]?.disabled) break;
    }
    setActive(i);
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (options[active] && !options[active]!.disabled) commit(options[active]!.value);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1) {
          const now = Date.now();
          typed.current.q = now - typed.current.t > 700 ? e.key.toLowerCase() : typed.current.q + e.key.toLowerCase();
          typed.current.t = now;
          const i = options.findIndex((o) => o.text.toLowerCase().startsWith(typed.current.q));
          if (i >= 0) setActive(i);
        }
    }
  }

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-describedby={rest["aria-describedby"]}
        aria-invalid={rest["aria-invalid"]}
        aria-label={rest["aria-label"]}
        aria-required={required}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        className={cn(
          "group relative flex h-11 w-full items-center gap-2 rounded-xl border border-line-strong bg-card pl-3.5 pr-10 text-left text-[15px] text-ink transition-colors hover:border-rule-strong focus:outline-none focus-visible:border-moss focus-visible:ring-4 focus-visible:ring-moss/12 aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted",
          open && "border-moss ring-4 ring-moss/12",
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted")}>{selected ? selected.label : (placeholder ?? "Bitte wählen")}</span>
        <ChevronDown size={16} aria-hidden className={cn("absolute right-3.5 top-1/2 -translate-y-1/2 text-muted transition-transform duration-200", open && "rotate-180 text-moss")} />
      </button>
      <input ref={hidden} type="hidden" name={name} value={current} form={form} readOnly />
      {open &&
        pos &&
        createPortal(
          <ul
            ref={(el) => {
              list.current = el;
              // Top-Layer: liegt auch über modalen <dialog>-Elementen (showModal)
              if (el && !el.matches(":popover-open")) {
                try {
                  el.showPopover();
                } catch {}
              }
            }}
            popover="manual"
            id={listId}
            role="listbox"
            aria-labelledby={id}
            tabIndex={-1}
            style={{ position: "fixed", inset: "auto", margin: 0, left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
            className="z-[120] max-h-[300px] overflow-y-auto rounded-2xl border border-line bg-card p-1.5 shadow-float animate-pop"
          >
            {options.map((o, i) => {
              const isSel = o.value === current;
              return (
                <li
                  key={`${o.value}-${i}`}
                  id={`${listId}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !o.disabled && commit(o.value)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px] text-ink-2",
                    i === active && "bg-moss-soft text-ink",
                    isSel && "font-semibold text-moss-ink",
                    o.disabled && "cursor-not-allowed opacity-45",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {isSel && <Check size={15} className="shrink-0 text-moss" aria-hidden />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
});
