"use client";

import { useId, useRef, useState } from "react";
import { Check, ImageUp, Loader2, Trash2 } from "lucide-react";
import {
  ANNOUNCEMENT_BG_POSITIONS,
  ANNOUNCEMENT_BODY_SIZES,
  ANNOUNCEMENT_FONTS,
  ANNOUNCEMENT_FONT_KEYS,
  ANNOUNCEMENT_OVERLAY_MAX,
  ANNOUNCEMENT_SWATCHES,
  ANNOUNCEMENT_TITLE_SIZES,
  ANNOUNCEMENT_TONES,
  ANNOUNCEMENT_TONE_KEYS,
  announcementColors,
  isHexColor,
  readableOn,
  type AnnouncementBgMode,
  type AnnouncementBgPosition,
  type AnnouncementBodySize,
  type AnnouncementFont,
  type AnnouncementTitleSize,
  type AnnouncementTone,
} from "@werkraum/shared";
import { isAbortError, uploadFile } from "@/components/media/uploader";
import { FieldError } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export type AnnouncementDesign = {
  tone: AnnouncementTone;
  bgMode: AnnouncementBgMode;
  bgColor: string;
  bgMediaId: string;
  /** Anzeige-Adresse des Bildes (vom Server oder direkt nach dem Hochladen) */
  bgImageUrl: string | null;
  bgOverlay: number;
  bgImageLight: string;
  bgPosition: AnnouncementBgPosition;
  textColor: string;
  titleFont: AnnouncementFont;
  bodyFont: AnnouncementFont;
  titleSize: AnnouncementTitleSize;
  bodySize: AnnouncementBodySize;
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Helle Stelle eines Bildes (90. Perzentil der Helligkeit) – Grundlage der Lesbarkeitsprüfung.
 * Kann der Browser das Format nicht lesen (z. B. HEIC in Chrome), gilt Weiss als ungünstigster Fall.
 */
async function measureLight(file: File): Promise<string> {
  try {
    const bmp = await createImageBitmap(file, { resizeWidth: 64, resizeHeight: 64, resizeQuality: "low" });
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "#FFFFFF";
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const px = ctx.getImageData(0, 0, 64, 64).data;
    const list: [number, number, number, number][] = [];
    for (let i = 0; i < px.length; i += 4) list.push([0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!, px[i]!, px[i + 1]!, px[i + 2]!]);
    list.sort((a, b) => a[0] - b[0]);
    const [, r, g, b] = list[Math.floor(list.length * 0.9)]!;
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  } catch {
    return "#FFFFFF";
  }
}

/** Gemeinsamer Aufbau: Gruppenname + Inhalt */
function Group({ label, hint, children, error }: { label: string; hint?: string; children: React.ReactNode; error?: string }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="mb-1.5 text-[13px] font-semibold text-ink">
        {label}
      </p>
      {children}
      {hint && !error && <p className="mt-1.5 text-[13px] text-muted">{hint}</p>}
      <FieldError>{error}</FieldError>
    </div>
  );
}

/** Umschalter mit wenigen Möglichkeiten (Radiogruppe, mit Pfeiltasten bedienbar) */
function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: { value: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void; label: string; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + options.length) % options.length;
    onChange(options[n]!.value);
    refs.current[n]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-xl border border-line-strong bg-card p-0.5", className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") (e.preventDefault(), move(i + 1));
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") (e.preventDefault(), move(i - 1));
            }}
            className={cn("min-h-9 min-w-10 rounded-[10px] px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ink", on ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Farbwahl: Schnellwahl, Farbrad des Systems und Hex-Eingabe */
function ColorField({ value, onChange, label, auto }: { value: string; onChange: (hex: string) => void; label: string; auto?: { label: string; hex: string } }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value || auto?.hex || "");
  const swatch = (hex: string, on: boolean, name: string, onClick: () => void) => (
    <button
      key={name}
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={name}
      title={name}
      onClick={onClick}
      className={cn("grid size-8 place-items-center rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", on ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-paper" : "border-line-strong")}
      style={{ background: hex, color: readableOn(hex) }}
    >
      {on && <Check size={14} strokeWidth={3} aria-hidden />}
    </button>
  );
  return (
    <div className="space-y-2.5">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
        {auto && (
          <button
            type="button"
            role="radio"
            aria-checked={!value}
            onClick={() => (setDraft(null), onChange(""))}
            className={cn("h-8 rounded-lg border px-2.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", !value ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-2 hover:border-ink")}
          >
            {auto.label}
          </button>
        )}
        {ANNOUNCEMENT_SWATCHES.map((hex) => swatch(hex, value.toUpperCase() === hex, hex, () => (setDraft(null), onChange(hex))))}
      </div>
      <div className="flex items-center gap-2">
        <label className="relative grid size-9 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-line-strong" style={{ background: isHexColor(shown) ? shown : "transparent" }} title="Eigene Farbe wählen">
          <span className="sr-only">{label}: eigene Farbe</span>
          <input type="color" value={isHexColor(shown) ? shown.toLowerCase() : "#000000"} onChange={(e) => (setDraft(null), onChange(e.target.value.toUpperCase()))} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
        <input
          aria-label={`${label} als Hex-Wert`}
          value={draft ?? value}
          placeholder={auto ? `${auto.hex} (automatisch)` : "#RRGGBB"}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => {
            const raw = e.target.value.trim();
            const hex = raw && !raw.startsWith("#") ? `#${raw}` : raw;
            setDraft(hex);
            if (!hex) onChange("");
            else if (isHexColor(hex)) onChange(hex.toUpperCase());
          }}
          onBlur={() => setDraft(null)}
          className="h-9 w-40 rounded-lg border border-field bg-card px-2.5 font-mono text-[13px] uppercase text-ink outline-none placeholder:normal-case placeholder:text-muted focus:border-moss"
        />
      </div>
    </div>
  );
}

function FontChoice({ value, onChange, label, sample }: { value: AnnouncementFont; onChange: (f: AnnouncementFont) => void; label: string; sample: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ANNOUNCEMENT_FONT_KEYS.map((k) => {
        const f = ANNOUNCEMENT_FONTS[k];
        const on = value === k;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(k)}
            className={cn("rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", on ? "border-ink bg-card" : "border-line hover:border-line-strong")}
          >
            <span className="block truncate text-[19px] leading-tight text-ink" style={{ fontFamily: f.css, fontSize: `${19 * f.scale}px`, fontWeight: k === "werkuno" ? 800 : k === "hand" ? 700 : 600 }}>
              {sample}
            </span>
            <span className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-ink">
              {on && <Check size={12} strokeWidth={3} aria-hidden />} {f.label}
            </span>
            <span className="block text-[11.5px] leading-snug text-muted">{f.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AnnouncementDesignControls({ d, set, errors }: { d: AnnouncementDesign; set: <K extends keyof AnnouncementDesign>(k: K, v: AnnouncementDesign[K]) => void; errors: Record<string, string> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [upload, setUpload] = useState<{ progress: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const colors = announcementColors(d);
  const readable = colors.contrast >= 4.5;

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("image/")) return setUploadError("Bitte eine Bilddatei wählen (JPG, PNG, WebP, HEIC).");
    if (file.size > MAX_IMAGE_BYTES) return setUploadError("Das Bild ist grösser als 15 MB.");
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setUpload({ progress: 0 });
    try {
      const light = measureLight(file);
      const r = await uploadFile(file, "public", (p) => setUpload({ progress: p }), ctrl.signal);
      const url = r.variants?.lg ?? r.variants?.md;
      if (r.state !== "READY" || !url) throw new Error("Das Bild konnte nicht verarbeitet werden. Bitte ein anderes wählen.");
      set("bgMediaId", r.mediaId);
      set("bgImageUrl", url);
      set("bgImageLight", await light);
      set("bgMode", "image");
    } catch (e) {
      if (!isAbortError(e)) setUploadError(e instanceof Error ? e.message : "Hochladen fehlgeschlagen.");
    } finally {
      if (abort.current === ctrl) setUpload(null);
    }
  }

  /** Lesbar machen: Schrift auf die besser lesbare Farbe setzen bzw. das Bild stärker abdunkeln */
  function fixContrast() {
    if (colors.image) {
      // Zuerst die gewählte Schriftfarbe behalten und nur stärker abdunkeln, sonst auf Weiss wechseln
      for (const textColor of [d.textColor, ""]) {
        for (let o = d.bgOverlay; o <= ANNOUNCEMENT_OVERLAY_MAX; o += 5) {
          if (announcementColors({ ...d, textColor, bgOverlay: o }).contrast >= 4.5) return set("textColor", textColor), set("bgOverlay", o);
        }
      }
      return set("textColor", ""), set("bgOverlay", ANNOUNCEMENT_OVERLAY_MAX);
    }
    set("textColor", readableOn(colors.bg) === "#FFFFFF" ? "#FFFFFF" : "#262427");
  }

  return (
    <div className="space-y-6">
      <Group label="Hintergrund" error={errors.bgColor ?? errors.bgMediaId}>
        <Segmented
          label="Art des Hintergrunds"
          value={d.bgMode}
          onChange={(m) => set("bgMode", m)}
          options={[
            { value: "tone", label: "Palette" },
            { value: "color", label: "Eigene Farbe" },
            { value: "image", label: "Bild" },
          ]}
        />
        <div className="mt-3">
          {d.bgMode === "tone" && (
            <div role="radiogroup" aria-label="Palettenfarbe" className="flex flex-wrap gap-2.5">
              {ANNOUNCEMENT_TONE_KEYS.map((k) => {
                const t = ANNOUNCEMENT_TONES[k];
                const on = d.tone === k;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} onClick={() => set("tone", k)} className="group flex flex-col items-center gap-1.5 rounded-xl p-1 focus-visible:outline-2 focus-visible:outline-ink">
                    <span
                      className={cn("grid size-12 place-items-center rounded-xl border text-[15px] font-bold", on ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-paper" : "border-line group-hover:border-line-strong")}
                      style={{ background: t.bg, color: t.fg }}
                    >
                      {on ? <Check size={18} strokeWidth={2.6} aria-hidden /> : "Aa"}
                    </span>
                    <span className={cn("text-[12px]", on ? "font-semibold text-ink" : "text-muted")}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {d.bgMode === "color" && <ColorField label="Hintergrundfarbe" value={d.bgColor} onChange={(c) => set("bgColor", c)} />}
          {d.bgMode === "image" && (
            <div className="space-y-4">
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => (pickImage(e.target.files?.[0]), (e.target.value = ""))} />
              {d.bgImageUrl ? (
                <div className="flex flex-wrap items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.bgImageUrl} alt="Gewähltes Hintergrundbild" className="h-20 w-32 rounded-lg border border-line object-cover" style={{ objectPosition: `center ${d.bgPosition}` }} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={!!upload} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-semibold text-ink hover:border-ink disabled:opacity-60">
                      <ImageUp size={15} aria-hidden /> Anderes Bild
                    </button>
                    <button
                      type="button"
                      onClick={() => (set("bgMediaId", ""), set("bgImageUrl", null))}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-ink-2 hover:bg-sunken hover:text-ink"
                    >
                      <Trash2 size={15} aria-hidden /> Entfernen
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => (e.preventDefault(), pickImage(e.dataTransfer.files?.[0]))}
                  disabled={!!upload}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 py-7 text-center hover:border-ink disabled:cursor-wait"
                >
                  <ImageUp size={22} className="text-ink-2" aria-hidden />
                  <span className="text-[14px] font-semibold text-ink">Bild hochladen</span>
                  <span className="text-[12.5px] text-muted">Hierher ziehen oder klicken · JPG, PNG, WebP, HEIC · bis 15 MB · am besten quer, ab 1600 px breit</span>
                </button>
              )}
              {upload && (
                <p className="flex items-center gap-2 text-[13px] text-ink-2" role="status">
                  <Loader2 size={14} className="animate-spin" aria-hidden /> {upload.progress < 1 ? `Wird hochgeladen … ${Math.round(upload.progress * 100)} %` : "Wird verarbeitet …"}
                </p>
              )}
              <FieldError>{uploadError}</FieldError>
              {d.bgImageUrl && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ann-overlay" className="mb-1.5 flex justify-between text-[13px] font-semibold text-ink">
                      Abdunkeln <span className="font-mono font-normal text-muted">{d.bgOverlay} %</span>
                    </label>
                    <input id="ann-overlay" type="range" min={0} max={ANNOUNCEMENT_OVERLAY_MAX} step={5} value={d.bgOverlay} onChange={(e) => set("bgOverlay", Number(e.target.value))} className="w-full accent-[var(--color-ink)]" />
                  </div>
                  <div>
                    <p className="mb-1.5 text-[13px] font-semibold text-ink">Bildausschnitt</p>
                    <Segmented label="Bildausschnitt" value={d.bgPosition} onChange={(p) => set("bgPosition", p)} options={(Object.keys(ANNOUNCEMENT_BG_POSITIONS) as AnnouncementBgPosition[]).map((p) => ({ value: p, label: ANNOUNCEMENT_BG_POSITIONS[p] }))} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Group>

      <Group label="Schriftart Titel">
        <FontChoice label="Schriftart Titel" value={d.titleFont} onChange={(f) => set("titleFont", f)} sample="Weihnachtsmarkt" />
      </Group>
      <Group label="Schriftart Text">
        <FontChoice label="Schriftart Text" value={d.bodyFont} onChange={(f) => set("bodyFont", f)} sample="Handgemacht" />
      </Group>

      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <Group label="Grösse Titel">
          <Segmented label="Grösse Titel" value={d.titleSize} onChange={(s) => set("titleSize", s)} options={(Object.keys(ANNOUNCEMENT_TITLE_SIZES) as AnnouncementTitleSize[]).map((s) => ({ value: s, label: ANNOUNCEMENT_TITLE_SIZES[s].label }))} />
        </Group>
        <Group label="Grösse Text">
          <Segmented label="Grösse Text" value={d.bodySize} onChange={(s) => set("bodySize", s)} options={(Object.keys(ANNOUNCEMENT_BODY_SIZES) as AnnouncementBodySize[]).map((s) => ({ value: s, label: ANNOUNCEMENT_BODY_SIZES[s].label }))} />
        </Group>
      </div>

      <Group label="Schriftfarbe" error={errors.textColor}>
        <ColorField label="Schriftfarbe" value={d.textColor} onChange={(c) => set("textColor", c)} auto={{ label: "Automatisch", hex: announcementColors({ ...d, textColor: "" }).fg }} />
        <p className={cn("mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]", readable ? "text-ink-2" : "font-medium text-danger")} role="status">
          <span className="font-mono">{colors.contrast.toFixed(1)} : 1</span>
          {readable ? "– gut lesbar." : colors.image ? "– auf hellen Bildstellen schlecht lesbar." : "– zu wenig Kontrast, schlecht lesbar."}
          {!readable && (
            <button type="button" onClick={fixContrast} className="rounded-md border border-current px-2 py-0.5 text-[12px] font-semibold hover:bg-danger/10">
              Lesbar machen
            </button>
          )}
        </p>
      </Group>
    </div>
  );
}
