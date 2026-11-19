import { describe, expect, it } from "vitest";
import { baseCropSize, clampCrop, cropRect } from "../crop-math";

describe("Zuschnitt 9:16", () => {
  it("grösster Ausschnitt bei Zoom 1 – Querformat und Hochformat", () => {
    expect(baseCropSize(4000, 3000)).toEqual({ bw: 1687.5, bh: 3000 });
    expect(baseCropSize(1000, 4000)).toEqual({ bw: 1000, bh: (1000 * 16) / 9 });
  });

  it("Ausschnitt bleibt im Bild, Zoom 1–4", () => {
    const c = clampCrop({ cx: -500, cy: 99999, zoom: 9 }, 4000, 3000);
    expect(c.zoom).toBe(4);
    const r = cropRect(c, 4000, 3000);
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy + r.sh).toBeLessThanOrEqual(3000 + 1e-9);
    expect(clampCrop({ cx: 2000, cy: 1500, zoom: 0.2 }, 4000, 3000).zoom).toBe(1);
  });

  it("Seitenverhältnis immer 9:16", () => {
    for (const [w, h] of [[4000, 3000], [1080, 1920], [3000, 4000], [500, 500]] as const) {
      const r = cropRect(clampCrop({ cx: w / 2, cy: h / 2, zoom: 1.7 }, w, h), w, h);
      expect(r.sh / r.sw).toBeCloseTo(16 / 9, 6);
    }
  });
});
