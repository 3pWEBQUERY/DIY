"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Download, Link2, Plus, Printer, RotateCw, Trash2 } from "lucide-react";
import { ZS_DEFAULTS, computeCutting, cuttingCsv, decodeState, encodeState, parsePartsText, type ZsPart, type ZsResult, type ZsSettings } from "@/lib/zuschnitt";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const STORE = "wr-zuschnitt";
let seq = 0;
const newId = () => `z${Date.now().toString(36)}${(seq++).toString(36)}`;
const blank = (): ZsPart => ({ id: newId(), name: "", length: 0, width: 0, qty: 1, edgesL: 0, edgesW: 0, rotate: false });

/** Beispiel: kleiner Korpus mit Schubladen (passt zu den Werkuno-Anleitungen) */
const EXAMPLE: Omit<ZsPart, "id">[] = [
  { name: "Seite", length: 720, width: 560, qty: 2, edgesL: 1, edgesW: 0, rotate: false },
  { name: "Boden / Deckel", length: 762, width: 560, qty: 2, edgesL: 1, edgesW: 0, rotate: false },
  { name: "Fachboden", length: 760, width: 520, qty: 2, edgesL: 1, edgesW: 0, rotate: false },
  { name: "Tür", length: 717, width: 397, qty: 2, edgesL: 2, edgesW: 2, rotate: false },
  { name: "Sockelblende", length: 800, width: 80, qty: 1, edgesL: 1, edgesW: 0, rotate: true },
];

const PALETTE = ["#e7d3b6", "#d8e2d3", "#e9d5d0", "#d6dde6", "#efe1b8", "#e3d6e1", "#d9e6e6", "#eadcc9"];

function money(v: number, cur: "CHF" | "EUR") {
  return cur === "CHF" ? `CHF ${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}` : `${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")} €`;
}
const nf = (v: number, d = 1) => v.toLocaleString("de-CH", { minimumFractionDigits: d, maximumFractionDigits: d });

function NumInput({ value, onChange, label, min = 0, max = 10000, step = 1, className, suffix }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number | "any"; className?: string; suffix?: string }) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value || value === 0 ? (value === 0 ? "" : value) : ""}
        placeholder="0"
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);
        }}
        className={cn("h-10 w-full rounded-lg border border-field bg-card px-2.5 text-right text-[14px] tabular-nums outline-none focus:border-moss", suffix && "pr-9")}
      />
      {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted">{suffix}</span>}
    </label>
  );
}

function Plan({ sheet, n, total, s, colors }: { sheet: ZsResult["sheets"][number]; n: number; total: number; s: ZsSettings; colors: Map<string, string> }) {
  const pct = (sheet.usedArea / (s.boardLength * s.boardWidth)) * 100;
  return (
    <figure className="break-inside-avoid">
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
        <b>Platte {n} von {total}</b>
        <span className="text-muted num">{sheet.placed.length} Teile · {nf(pct, 0)} % genutzt</span>
      </figcaption>
      <svg viewBox={`0 0 ${s.boardLength} ${s.boardWidth}`} className="w-full rounded-lg border border-line-strong bg-[repeating-linear-gradient(135deg,#f3efeb_0_14px,#ebe5df_14px_16px)]" role="img" aria-label={`Schnittplan Platte ${n}`}>
        <rect x={s.trim} y={s.trim} width={s.boardLength - 2 * s.trim} height={s.boardWidth - 2 * s.trim} fill="#faf8f5" />
        {sheet.placed.map((p, i) => {
          const fs = Math.max(30, Math.min(70, Math.min(p.l, p.w) / 4));
          const showName = p.w > fs * 2.4 && p.l > fs * 4;
          return (
            <g key={i}>
              <rect x={p.x} y={p.y} width={p.l} height={p.w} fill={colors.get(p.partId) ?? "#e7d3b6"} stroke="#262427" strokeWidth={4} />
              {showName ? (
                <>
                  <text x={p.x + p.l / 2} y={p.y + p.w / 2 - fs * 0.55} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={700} fill="#262427">
                    {p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name}
                  </text>
                  <text x={p.x + p.l / 2} y={p.y + p.w / 2 + fs * 0.6} textAnchor="middle" dominantBaseline="middle" fontSize={fs * 0.85} fill="#4a4749">
                    {p.l} × {p.w}{p.rotated ? " ↻" : ""}
                  </text>
                </>
              ) : (
                p.w > 34 && p.l > 120 && (
                  <text x={p.x + p.l / 2} y={p.y + p.w / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(fs, p.w * 0.7)} fill="#262427">
                    {p.l} × {p.w}
                  </text>
                )
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/**
 * Zuschnittrechner: Teile eingeben → Platten, Schnittplan, Kantenband und Kosten. Speichert im
 * Browser, teilt per Link (Daten stehen im Link, nicht auf dem Server), exportiert CSV und PDF.
 */
export function CuttingCalculator() {
  // Feste ID für die erste Zeile: Server und Browser rendern gleich (keine Hydration-Abweichung)
  const [parts, setParts] = useState<ZsPart[]>(() => [{ ...blank(), id: "start" }]);
  const [s, setS] = useState<ZsSettings>(ZS_DEFAULTS);
  const [cur, setCur] = useState<"CHF" | "EUR">("CHF");
  const [paste, setPaste] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  // Laden: geteilter Link vor Gespeichertem
  useEffect(() => {
    const hash = new URLSearchParams(location.hash.slice(1)).get("d");
    const shared = hash ? decodeState(hash) : null;
    if (shared && shared.parts.length) {
      setParts(shared.parts.map((p) => ({ ...p, id: newId() })));
      setS(shared.settings);
      history.replaceState(null, "", location.pathname);
      toast("Geteilte Zuschnittliste geladen.");
    } else {
      try {
        const raw = JSON.parse(localStorage.getItem(STORE) ?? "null") as { parts?: ZsPart[]; s?: ZsSettings; cur?: "CHF" | "EUR" } | null;
        if (raw?.parts?.length) setParts(raw.parts.map((p) => ({ ...blank(), ...p, id: newId() })));
        if (raw?.s) setS({ ...ZS_DEFAULTS, ...raw.s });
        if (raw?.cur === "EUR" || raw?.cur === "CHF") setCur(raw.cur);
      } catch {
        /* nichts gespeichert */
      }
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ parts, s, cur }));
    } catch {
      /* privater Modus */
    }
  }, [loaded, parts, s, cur]);

  const valid = useMemo(() => parts.filter((p) => p.length > 0 && p.width > 0 && p.qty > 0), [parts]);
  const result = useMemo(() => computeCutting(valid, s), [valid, s]);
  const colors = useMemo(() => new Map(valid.map((p, i) => [p.id, PALETTE[i % PALETTE.length]!])), [valid]);

  const update = (id: string, patch: Partial<ZsPart>) => setParts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addRow = () => {
    setParts((ps) => [...ps, blank()]);
    requestAnimationFrame(() => tableRef.current?.querySelector<HTMLInputElement>("tr:last-child input")?.focus());
  };

  const download = () => {
    const blob = new Blob(["﻿" + cuttingCsv(valid, s)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "zuschnittliste.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const share = async () => {
    const url = `${location.origin}${location.pathname}#d=${encodeState(valid, s)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link kopiert. Die Liste steckt im Link – nichts wird gespeichert.");
    } catch {
      window.prompt("Link kopieren:", url);
    }
  };

  const usableL = s.boardLength - 2 * s.trim;
  const usableW = s.boardWidth - 2 * s.trim;

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      {/* ───── Eingabe ───── */}
      <div className="min-w-0 space-y-8 print:hidden">
        <section aria-labelledby="zs-board">
          <h2 id="zs-board" className="text-[15px] font-semibold">Platte</h2>
          <p className="mt-0.5 text-[13px] text-muted">Grossformat im Baumarkt meist 2800 × 2070 mm. Länge = Laufrichtung des Dekors.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Länge", "boardLength", 100, 6000, "mm"],
                ["Breite", "boardWidth", 100, 3000, "mm"],
                ["Stärke", "thickness", 1, 100, "mm"],
                ["Schnittfuge", "kerf", 0, 10, "mm"],
                ["Randbeschnitt", "trim", 0, 50, "mm"],
                ["Preis je Platte", "boardPrice", 0, 10000, cur === "CHF" ? "CHF" : "€"],
                ["Kantenband je m", "edgePrice", 0, 100, cur === "CHF" ? "CHF" : "€"],
                ["Zuschlag Kante", "edgeReserve", 0, 100, "%"],
              ] as const
            ).map(([label, key, min, max, suffix]) => (
              <div key={key}>
                <p className="mb-1 text-[12px] font-semibold text-ink-2">{label}</p>
                <NumInput label={label} value={s[key]} min={min} max={max} step={key === "boardPrice" || key === "edgePrice" ? "any" : 1} suffix={suffix} onChange={(v) => setS((x) => ({ ...x, [key]: v }))} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[13px]">
            <span className="text-muted">Währung</span>
            {(["CHF", "EUR"] as const).map((c) => (
              <button key={c} type="button" aria-pressed={cur === c} onClick={() => setCur(c)} className={cn("h-8 rounded-full border px-3 font-semibold", cur === c ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-2")}>
                {c}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="zs-parts">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="zs-parts" className="text-[15px] font-semibold">Teile</h2>
              <p className="mt-0.5 text-[13px] text-muted">Kanten: wie viele Längs- bzw. Breitkanten Kantenband bekommen. „Drehbar“ nur ohne Maserung.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPaste("")}>
                <ClipboardPaste size={14} aria-hidden /> Liste einfügen
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setParts(EXAMPLE.map((p) => ({ ...p, id: newId() })))}>
                Beispiel
              </Button>
            </div>
          </div>

          {paste !== null && (
            <div className="mt-3 rounded-xl border border-line bg-card p-3">
              <label htmlFor="zs-paste" className="text-[13px] font-semibold">Aus Excel, Numbers oder Text einfügen</label>
              <p className="text-[12.5px] text-muted">Eine Zeile pro Teil: Bezeichnung; Länge; Breite; Stück – getrennt mit Tab, Semikolon oder Komma.</p>
              <textarea id="zs-paste" value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} placeholder={"Seite; 720; 560; 2\nBoden; 762; 560; 2"} className="mt-2 w-full rounded-lg border border-field bg-paper p-2.5 font-mono text-[13px] outline-none focus:border-moss" />
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ink"
                  onClick={() => {
                    const add = parsePartsText(paste);
                    if (!add.length) return toast("Keine Teile erkannt. Bitte Länge und Breite als Zahlen angeben.", "error");
                    setParts((ps) => [...ps.filter((p) => p.length > 0 || p.name), ...add.map((p) => ({ ...p, id: newId() }))]);
                    setPaste(null);
                    toast(`${add.length} Teile übernommen.`);
                  }}
                >
                  Übernehmen
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setPaste(null)}>Abbrechen</Button>
              </div>
            </div>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                  <th className="py-1.5 pr-2 font-semibold">Bezeichnung</th>
                  <th className="w-[78px] py-1.5 pr-2 text-right font-semibold">Länge</th>
                  <th className="w-[78px] py-1.5 pr-2 text-right font-semibold">Breite</th>
                  <th className="w-[58px] py-1.5 pr-2 text-right font-semibold">Stück</th>
                  <th className="w-[104px] py-1.5 pr-2 font-semibold">Kanten L / B</th>
                  <th className="w-[60px] py-1.5 pr-2 font-semibold">Drehbar</th>
                  <th className="w-[40px]" />
                </tr>
              </thead>
              <tbody ref={tableRef}>
                {parts.map((p, i) => {
                  const big = p.length > 0 && p.width > 0 && !((p.length <= usableL && p.width <= usableW) || (p.rotate && p.width <= usableL && p.length <= usableW));
                  return (
                    <tr key={p.id} className="border-t border-line align-top">
                      <td className="py-1.5 pr-2">
                        <label className="sr-only" htmlFor={`zs-n-${p.id}`}>Bezeichnung Teil {i + 1}</label>
                        <input id={`zs-n-${p.id}`} value={p.name} maxLength={60} onChange={(e) => update(p.id, { name: e.target.value })} placeholder={`Teil ${i + 1}`} className="h-10 w-full rounded-lg border border-field bg-card px-2.5 outline-none focus:border-moss" />
                        {big && <p className="mt-1 text-[12px] font-medium text-danger">Grösser als die nutzbare Platte ({usableL} × {usableW})</p>}
                      </td>
                      <td className="py-1.5 pr-2"><NumInput label={`Länge Teil ${i + 1} in mm`} value={p.length} onChange={(v) => update(p.id, { length: Math.round(v) })} /></td>
                      <td className="py-1.5 pr-2"><NumInput label={`Breite Teil ${i + 1} in mm`} value={p.width} onChange={(v) => update(p.id, { width: Math.round(v) })} /></td>
                      <td className="py-1.5 pr-2"><NumInput label={`Stückzahl Teil ${i + 1}`} value={p.qty} min={0} max={999} onChange={(v) => update(p.id, { qty: Math.round(v) })} /></td>
                      <td className="py-1.5 pr-2">
                        <div className="flex gap-1">
                          {(["edgesL", "edgesW"] as const).map((k) => (
                            <label key={k} className="flex-1">
                              <span className="sr-only">{k === "edgesL" ? "Längskanten" : "Breitkanten"} Teil {i + 1}</span>
                              <select value={p[k]} onChange={(e) => update(p.id, { [k]: Number(e.target.value) })} className="h-10 w-full rounded-lg border border-field bg-card px-1.5 text-[13px] outline-none focus:border-moss">
                                <option value={0}>0</option>
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                              </select>
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <button type="button" role="switch" aria-checked={p.rotate} aria-label={`Teil ${i + 1} darf gedreht werden`} onClick={() => update(p.id, { rotate: !p.rotate })} className={cn("grid h-10 w-full place-items-center rounded-lg border", p.rotate ? "border-moss bg-moss-soft text-moss-ink" : "border-field text-muted")}>
                          <RotateCw size={15} aria-hidden />
                        </button>
                      </td>
                      <td className="py-1.5">
                        <button type="button" aria-label={`Teil ${i + 1} entfernen`} onClick={() => setParts((ps) => (ps.length > 1 ? ps.filter((x) => x.id !== p.id) : [blank()]))} className="grid size-10 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink">
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus size={14} aria-hidden /> Teil hinzufügen
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Alle Teile löschen?")) setParts([blank()]);
              }}
            >
              Alles leeren
            </Button>
          </div>
        </section>
      </div>

      {/* ───── Ergebnis ───── */}
      <div className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:self-start print:col-span-full">
        <section aria-labelledby="zs-result" aria-live="polite">
          <h2 id="zs-result" className="text-[15px] font-semibold">Ergebnis</h2>
          {valid.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-line-strong p-6 text-center text-[14px] text-muted">Gib links die Teile mit Länge und Breite ein – Platten und Schnittplan erscheinen hier.</p>
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
                {[
                  { k: "Platten", v: `${result.sheets.length}`, n: `${s.boardLength} × ${s.boardWidth} × ${s.thickness}` },
                  { k: "Verschnitt", v: `${nf(result.waste * 100, 0)} %`, n: `${nf(result.partArea, 2)} von ${nf(result.boardArea, 2)} m²` },
                  { k: "Kantenband", v: `${nf(result.edgeMetersWithReserve, 1)} m`, n: `${nf(result.edgeMeters, 1)} m + ${s.edgeReserve} %` },
                  { k: "Schnitte", v: `ca. ${result.cuts}`, n: `${result.partCount} Teile` },
                ].map((x) => (
                  <div key={x.k} className="bg-card px-3.5 py-3">
                    <dt className="spec">{x.k}</dt>
                    <dd className="mt-0.5 text-[20px] font-bold num">{x.v}</dd>
                    <dd className="text-[11.5px] text-muted num">{x.n}</dd>
                  </div>
                ))}
              </dl>
              {(s.boardPrice > 0 || s.edgePrice > 0) && (
                <p className="mt-3 rounded-xl bg-sunken px-4 py-3 text-[14px]">
                  Material ca. <b className="num">{money(result.cost.total, cur)}</b>
                  <span className="text-muted num">
                    {" "}· Platten {money(result.cost.boards, cur)}{s.edgePrice > 0 ? ` · Kantenband ${money(result.cost.edges, cur)}` : ""}
                  </span>
                </p>
              )}
              {result.tooLarge.length > 0 && (
                <p role="alert" className="mt-3 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-[13.5px]">
                  Passt auf keine Platte: {result.tooLarge.map((t) => `${t.name || "Teil"} (${t.length} × ${t.width})`).join(", ")}. Grösseres Format wählen oder das Teil teilen.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2 print:hidden">
                <Button type="button" variant="ink" size="sm" onClick={() => window.print()}>
                  <Printer size={14} aria-hidden /> Drucken / PDF
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={download}>
                  <Download size={14} aria-hidden /> CSV
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={share}>
                  <Link2 size={14} aria-hidden /> Link teilen
                </Button>
              </div>
            </>
          )}
        </section>

        {result.sheets.length > 0 && (
          <section aria-label="Schnittpläne" className="space-y-5">
            {result.sheets.map((sh, i) => (
              <Plan key={i} sheet={sh} n={i + 1} total={result.sheets.length} s={s} colors={colors} />
            ))}
            <p className="text-[12.5px] leading-relaxed text-muted">
              Plan als Vorschlag: Länge waagrecht, Schnittfuge {s.kerf} mm, Randbeschnitt {s.trim} mm. ↻ = gedreht. Im Markt sägt man meist zuerst die langen Schnitte quer durch die ganze Platte. Den Plan mitnehmen und dort abstimmen.
            </p>
          </section>
        )}

        {/* Zuschnittliste für den Ausdruck */}
        {valid.length > 0 && (
          <section className="hidden print:block">
            <h2 className="text-[15px] font-semibold">Zuschnittliste · {s.thickness} mm</h2>
            <table className="mt-2 w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="border-b border-ink text-left">
                  <th className="py-1 pr-2">Pos.</th><th className="pr-2">Bezeichnung</th><th className="pr-3 text-right">L × B (mm)</th><th className="pr-3 text-right">Stück</th><th className="pr-3">Kanten L/B</th><th>Maserung</th>
                </tr>
              </thead>
              <tbody>
                {valid.map((p, i) => (
                  <tr key={p.id} className="border-b border-line">
                    <td className="py-1 pr-2">{i + 1}</td><td className="pr-2">{p.name || `Teil ${i + 1}`}</td><td className="pr-3 text-right tabular-nums">{p.length} × {p.width}</td><td className="pr-3 text-right">{p.qty}</td><td className="pr-3">{p.edgesL} / {p.edgesW}</td><td>{p.rotate ? "drehbar" : "beachten"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
