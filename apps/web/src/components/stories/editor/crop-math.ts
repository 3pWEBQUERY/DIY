/** Rechnung für den 9:16-Zuschnitt (rein, ohne Browser testbar). */

export const CROP_OUTPUT_WIDTH = 1080;
export const ZOOM_MAX = 4;

/** Ausschnitt in Bildpunkten: Mitte und Zoom (1 = grösster 9:16-Ausschnitt, der ins Bild passt) */
export type Crop = { cx: number; cy: number; zoom: number };

/** Grösster 9:16-Ausschnitt eines Bildes bei Zoom 1 */
export function baseCropSize(w: number, h: number) {
  const bw = Math.min(w, (h * 9) / 16);
  return { bw, bh: (bw * 16) / 9 };
}

/** Ausschnitt so begrenzen, dass er vollständig im Bild liegt */
export function clampCrop(c: Crop, w: number, h: number): Crop {
  const zoom = Math.min(ZOOM_MAX, Math.max(1, Number.isFinite(c.zoom) ? c.zoom : 1));
  const { bw, bh } = baseCropSize(w, h);
  const cw = bw / zoom;
  const ch = bh / zoom;
  return { zoom, cx: Math.min(w - cw / 2, Math.max(cw / 2, c.cx)), cy: Math.min(h - ch / 2, Math.max(ch / 2, c.cy)) };
}

/** Quellrechteck (Bildpunkte) eines Ausschnitts */
export function cropRect(c: Crop, w: number, h: number) {
  const { bw, bh } = baseCropSize(w, h);
  const cw = bw / c.zoom;
  const ch = bh / c.zoom;
  return { sx: c.cx - cw / 2, sy: c.cy - ch / 2, sw: cw, sh: ch };
}

