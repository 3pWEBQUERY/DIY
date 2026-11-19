"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider, ToolPanel } from "./editor-ui";
import { CROP_OUTPUT_WIDTH, ZOOM_MAX, clampCrop, cropRect, type Crop } from "./crop-math";

/**
 * Zuschneiden (nur Fotos): Ausschnitt im Story-Format 9:16 mit Zoom und Verschieben. Destruktiv im
 * Browser – hochgeladen wird nur der Ausschnitt (als JPEG, ohne Metadaten wie GPS). Ein nur gespeicherter
 * Ausschnitt würde die weggeschnittenen Bildteile über die öffentliche Medien-Adresse weiter ausliefern.
 */

/** Datei als Bild öffnen (EXIF-Drehung beachtet). `null`, wenn der Browser das Format nicht lesen kann (z. B. HEIC in Chrome). */
export async function decodeImage(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function" || !file.type.startsWith("image/")) return null;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (!bmp.width || !bmp.height) {
      bmp.close();
      return null;
    }
    return bmp;
  } catch {
    return null;
  }
}

/** Ausschnitt rendern und als JPEG-Datei liefern (höchstens 1080 × 1920). */
export async function renderCrop(bmp: ImageBitmap, c: Crop, name: string): Promise<File | null> {
  const { sx, sy, sw, sh } = cropRect(c, bmp.width, bmp.height);
  const outW = Math.max(1, Math.min(CROP_OUTPUT_WIDTH, Math.round(sw)));
  const outH = Math.round((outW * 16) / 9);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, outW, outH);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) return null;
  return new File([blob], `${name.replace(/\.[^.]+$/, "") || "story"}-zuschnitt.jpg`, { type: "image/jpeg" });
}

export function CropTool({ bitmap, fileName, onApply, onSkip, onCancel }: { bitmap: ImageBitmap; fileName: string; onApply: (file: File) => void; onSkip: () => void; onCancel: () => void }) {
  const W = bitmap.width;
  const H = bitmap.height;
  const [crop, setCrop] = useState<Crop>(() => clampCrop({ cx: W / 2, cy: H / 2, zoom: 1 }, W, H));
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; crop: Crop } | null>(null);
  const helpId = useId();

  // Vorschau zeichnen (scharf auf hochauflösenden Bildschirmen)
  const paint = useCallback(() => {
    const cv = canvas.current;
    const fr = frame.current;
    if (!cv || !fr) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(fr.clientWidth * dpr);
    const h = Math.round(fr.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const { sx, sy, sw, sh } = cropRect(crop, W, H);
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  }, [bitmap, crop, W, H]);
  useEffect(paint, [paint]);
  useEffect(() => {
    const ro = new ResizeObserver(paint);
    if (frame.current) ro.observe(frame.current);
    return () => ro.disconnect();
  }, [paint]);

  const set = (c: Crop) => setCrop(clampCrop(c, W, H));
  /** Bildschirmpixel → Bildpunkte beim aktuellen Zoom */
  const perPx = () => cropRect(crop, W, H).sw / (frame.current?.clientWidth || 1);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Zeiger nicht mehr aktiv */
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, crop };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const k = perPx();
    set({ ...d.crop, cx: d.crop.cx - (e.clientX - d.x) * k, cy: d.crop.cy - (e.clientY - d.y) * k });
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const { sw, sh } = cropRect(crop, W, H);
    const f = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-sw * f, 0], ArrowRight: [sw * f, 0], ArrowUp: [0, -sh * f], ArrowDown: [0, sh * f] };
    if (moves[e.key]) {
      e.preventDefault();
      set({ ...crop, cx: crop.cx + moves[e.key]![0], cy: crop.cy + moves[e.key]![1] });
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      set({ ...crop, zoom: crop.zoom * 1.1 });
    } else if (e.key === "-") {
      e.preventDefault();
      set({ ...crop, zoom: crop.zoom / 1.1 });
    }
  }
  useEffect(() => {
    const fr = frame.current;
    if (!fr) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      setCrop((c) => clampCrop({ ...c, zoom: c.zoom * Math.exp(-ev.deltaY * 0.0015) }, W, H));
    };
    fr.addEventListener("wheel", onWheel, { passive: false });
    return () => fr.removeEventListener("wheel", onWheel);
  }, [W, H]);

  async function apply() {
    setBusy(true);
    const file = await renderCrop(bitmap, crop, fileName);
    setBusy(false);
    if (file) onApply(file);
    else onSkip();
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-[min(17rem,calc(58dvh*9/16))] sm:max-w-[17rem]">
        <div
          ref={frame}
          role="group"
          tabIndex={0}
          aria-label="Bildausschnitt"
          aria-describedby={helpId}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={onKeyDown}
          className="relative aspect-[9/16] w-full cursor-grab touch-none select-none overflow-hidden rounded-2xl border border-line bg-sunken outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:cursor-grabbing"
        >
          <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
          {/* Drittel-Raster als Orientierung */}
          <span aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="border-[0.5px] border-white/35" />
            ))}
          </span>
        </div>
        <p id={helpId} className="sr-only">
          Ziehen oder Pfeiltasten verschieben den Ausschnitt (mit Umschalt in grossen Schritten), Plus und Minus zoomen.
        </p>
      </div>

      <ToolPanel title="Zuschneiden" onDone={onCancel} doneLabel="Abbrechen">
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Wähle den Ausschnitt im Story-Format. Hochgeladen wird nur der Ausschnitt – was du wegschneidest, verlässt dein Gerät nicht.
        </p>
        <Slider label="Zoom" value={Math.round(crop.zoom * 100)} min={100} max={ZOOM_MAX * 100} step={5} format={(v) => `${v} %`} onChange={(v) => set({ ...crop, zoom: v / 100 })} />
        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onSkip} disabled={busy}>
            Ganzes Bild verwenden
          </Button>
          <Button onClick={apply} disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Zuschnitt übernehmen
          </Button>
        </div>
      </ToolPanel>
    </div>
  );
}
