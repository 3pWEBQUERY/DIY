"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/field";

/**
 * Tastenkürzel aus einer einzelnen Taste („/“, „[“, „?“) lassen sich abschalten (WCAG 2.1.4):
 * Sprachsteuerung oder versehentliche Tastendrücke lösen sie sonst ungewollt aus. Die Einstellung
 * gilt pro Browser (localStorage). Kürzel mit Modifikatortaste (⌘/Strg + K) bleiben immer aktiv.
 */
const KEY = "wr_single_key_shortcuts";
const EVENT = "wr:shortcuts-setting";
const HELP_EVENT = "wr:shortcuts-help";
// Rückfall, wenn der Browser localStorage sperrt (z. B. privates Fenster): gilt bis zum Neuladen
let memory: boolean | null = null;

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return memory ?? true;
  }
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function setSingleKeyShortcuts(on: boolean) {
  memory = on;
  try {
    if (on) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, "off");
  } catch {
    /* Speicher gesperrt – Wert bleibt in `memory` */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Sind Einzeltasten-Kürzel aktiv? (Server-Render: ja, danach Wert aus dem Browser.) */
export function useSingleKeyShortcuts() {
  return useSyncExternalStore(subscribe, read, () => true);
}

/** Aktuellen Wert ausserhalb von React lesen (z. B. in einem keydown-Handler). */
export function singleKeyShortcutsEnabled() {
  return typeof window !== "undefined" && read();
}

/** Tippt die Person gerade (Eingabefeld, Auswahl, contenteditable)? Dann keine Einzeltasten-Kürzel. */
export function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest?.("[contenteditable]:not([contenteditable=false]), [role=textbox], [role=combobox]");
}

export function openShortcutsHelp() {
  window.dispatchEvent(new Event(HELP_EVENT));
}

const SHORTCUTS: { keys: string[]; label: string; single?: boolean }[] = [
  { keys: ["⌘", "K"], label: "Befehlspalette öffnen oder schliessen (Windows/Linux: Strg + K)" },
  { keys: ["/"], label: "Suche öffnen", single: true },
  { keys: ["["], label: "Seitenleiste ein- oder ausklappen (breite Bildschirme)", single: true },
  { keys: ["?"], label: "Diese Übersicht anzeigen", single: true },
  { keys: ["Esc"], label: "Dialog oder Menü schliessen" },
];

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 gap-1">
      {keys.map((k) => (
        <kbd key={k} className="grid h-6 min-w-6 place-items-center rounded-md border border-line-strong bg-sunken px-1.5 font-sans text-[12px] font-semibold text-ink">
          {k}
        </kbd>
      ))}
    </span>
  );
}

/** Schalter für Einzeltasten-Kürzel (Einstellungen und Übersichtsdialog). */
export function ShortcutsToggle() {
  const enabled = useSingleKeyShortcuts();
  return (
    <Checkbox
      checked={enabled}
      onChange={(e) => setSingleKeyShortcuts(e.currentTarget.checked)}
      label={
        <>
          <span className="font-semibold">Tastenkürzel mit einer einzelnen Taste</span>
          <span className="block text-xs text-muted">„/“ öffnet die Suche, „[“ klappt die Seitenleiste ein, „?“ zeigt alle Kürzel. Gilt für diesen Browser und sofort.</span>
        </>
      }
    />
  );
}

/** „?“ zeigt alle Tastenkürzel – nur, wenn Einzeltasten-Kürzel aktiv sind und nicht gerade getippt wird. */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target) || !singleKeyShortcutsEnabled()) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      setOpen(true);
    };
    const onHelp = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(HELP_EVENT, onHelp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(HELP_EVENT, onHelp);
    };
  }, []);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Tastenkürzel">
      <ul className="divide-y divide-line border-y border-line">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <span>
              {s.label}
              {s.single && <span className="sr-only"> (Einzeltasten-Kürzel)</span>}
            </span>
            <Keys keys={s.keys} />
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <ShortcutsToggle />
      </div>
    </Dialog>
  );
}
