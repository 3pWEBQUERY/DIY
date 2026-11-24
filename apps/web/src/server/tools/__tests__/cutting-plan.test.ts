import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { ZS_DEFAULTS, computeCutting, decodeState } from "@/lib/zuschnitt";
import { cuttingPlan } from "../cutting-plan";

const url = (p: string) => `https://werkuno.ch${p}`;
const parts = [
  { name: "Seite", length: 2140, width: 600, qty: 2 },
  { name: "Boden", length: 1962, width: 600, qty: 1 },
  { name: "Front", length: 397, width: 160, qty: 4, rotate: true },
];

describe("Zuschnittrechner für die App", () => {
  it("rechnet exakt wie die Web-Bibliothek", () => {
    const r = cuttingPlan({ parts, settings: { boardPrice: 90 } }, url);
    const expected = computeCutting(r.parts, { ...ZS_DEFAULTS, boardPrice: 90 });
    expect(r.result).toEqual(expected);
    expect(r.result.sheets.length).toBeGreaterThan(0);
    expect(r.settings.kerf).toBe(ZS_DEFAULTS.kerf);
  });

  it("liefert CSV und einen Teilen-Link, der im Web denselben Plan öffnet", () => {
    const r = cuttingPlan({ parts }, url);
    expect(r.csv.split("\r\n")[0]).toContain("Bezeichnung");
    expect(r.csv).toContain("Seite");
    expect(r.shareUrl).toMatch(/^https:\/\/werkuno\.ch\/werkzeuge\/zuschnitt#d=/);
    const decoded = decodeState(r.shareUrl.split("#d=")[1]!);
    expect(decoded?.parts.map((p) => [p.name, p.length, p.width, p.qty])).toEqual([
      ["Seite", 2140, 600, 2],
      ["Boden", 1962, 600, 1],
      ["Front", 397, 160, 4],
    ]);
  });

  it("meldet Teile, die auf keine Platte passen", () => {
    const r = cuttingPlan({ parts: [{ name: "Zu gross", length: 3000, width: 700, qty: 1 }] }, url);
    expect(r.result.tooLarge).toEqual([{ name: "Zu gross", length: 3000, width: 700 }]);
  });

  it("lehnt ungültige oder zu grosse Eingaben ab", () => {
    expect(() => cuttingPlan({ parts: [] }, url)).toThrow(ZodError);
    expect(() => cuttingPlan({ parts: [{ name: "x", length: 0, width: 100 }] }, url)).toThrow(ZodError);
    expect(() => cuttingPlan({ parts: [{ name: "x", length: 20000, width: 100 }] }, url)).toThrow(ZodError);
    expect(() => cuttingPlan({ parts: [{ name: "x", length: 100, width: 100, qty: 1000 }] }, url)).toThrow(ZodError);
    expect(() => cuttingPlan({ parts: [{ name: "x", length: 100, width: 100 }], settings: { kerf: 50 } }, url)).toThrow(ZodError);
    const many = Array.from({ length: 3 }, (_, i) => ({ name: `T${i}`, length: 100, width: 100, qty: 999 }));
    expect(() => cuttingPlan({ parts: many }, url)).toThrow(/Höchstens 2000 Teile/);
  });
});
