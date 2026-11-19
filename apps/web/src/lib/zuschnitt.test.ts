import { describe, expect, it } from "vitest";
import { ZS_DEFAULTS, computeCutting, cuttingCsv, decodeState, encodeState, parsePartsText, type ZsPart } from "./zuschnitt";

const part = (p: Partial<ZsPart> & Pick<ZsPart, "length" | "width">): ZsPart => ({ id: Math.random().toString(36), name: "Teil", qty: 1, edgesL: 0, edgesW: 0, rotate: false, ...p });

function overlaps(a: { x: number; y: number; l: number; w: number }, b: { x: number; y: number; l: number; w: number }) {
  return a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.w && b.y < a.y + a.w;
}

describe("computeCutting", () => {
  it("legt Teile ohne Überlappung innerhalb der nutzbaren Platte ab", () => {
    const parts = [part({ length: 2140, width: 600, qty: 2 }), part({ length: 652, width: 600, qty: 6 }), part({ length: 1962, width: 100, qty: 4 }), part({ length: 397, width: 160, qty: 4 })];
    const r = computeCutting(parts, ZS_DEFAULTS);
    expect(r.partCount).toBe(16);
    for (const sh of r.sheets) {
      for (const p of sh.placed) {
        expect(p.x).toBeGreaterThanOrEqual(ZS_DEFAULTS.trim);
        expect(p.y).toBeGreaterThanOrEqual(ZS_DEFAULTS.trim);
        expect(p.x + p.l).toBeLessThanOrEqual(ZS_DEFAULTS.boardLength - ZS_DEFAULTS.trim);
        expect(p.y + p.w).toBeLessThanOrEqual(ZS_DEFAULTS.boardWidth - ZS_DEFAULTS.trim);
      }
      for (let i = 0; i < sh.placed.length; i++) for (let j = i + 1; j < sh.placed.length; j++) expect(overlaps(sh.placed[i]!, sh.placed[j]!)).toBe(false);
    }
  });

  it("hält die Schnittfuge zwischen Nachbarteilen ein", () => {
    const r = computeCutting([part({ length: 1000, width: 500, qty: 2 })], { ...ZS_DEFAULTS, kerf: 4 });
    const [a, b] = r.sheets[0]!.placed;
    const gapX = Math.abs(b!.x - a!.x) - (b!.x > a!.x ? a!.l : b!.l);
    const gapY = Math.abs(b!.y - a!.y) - (b!.y > a!.y ? a!.w : b!.w);
    expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(4);
  });

  it("dreht Teile mit Maserung nie, drehbare nur wenn nötig", () => {
    const fixed = computeCutting([part({ length: 300, width: 2500, rotate: false })], ZS_DEFAULTS);
    expect(fixed.sheets).toHaveLength(0);
    expect(fixed.tooLarge).toHaveLength(1);
    const free = computeCutting([part({ length: 300, width: 2500, rotate: true })], ZS_DEFAULTS);
    expect(free.sheets[0]!.placed[0]!.rotated).toBe(true);
  });

  it("öffnet weitere Platten, wenn eine voll ist", () => {
    const r = computeCutting([part({ length: 2000, width: 1000, qty: 3 })], ZS_DEFAULTS);
    expect(r.sheets.length).toBe(2);
    expect(r.boardArea).toBeCloseTo((2 * 2800 * 2070) / 1e6, 3);
  });

  it("rechnet Kantenband und Kosten", () => {
    const r = computeCutting([part({ length: 1000, width: 500, qty: 2, edgesL: 1, edgesW: 2 })], { ...ZS_DEFAULTS, boardPrice: 190, edgePrice: 1.5, edgeReserve: 10 });
    expect(r.edgeMeters).toBeCloseTo(2 * (1 + 1), 5);
    expect(r.edgeMetersWithReserve).toBeCloseTo(4.4, 5);
    expect(r.cost.boards).toBe(190);
    expect(r.cost.edges).toBeCloseTo(6.6, 5);
  });

  it("ignoriert leere Zeilen und Stückzahl 0", () => {
    const r = computeCutting([part({ length: 0, width: 500 }), part({ length: 500, width: 500, qty: 0 })], ZS_DEFAULTS);
    expect(r.partCount).toBe(0);
    expect(r.sheets).toHaveLength(0);
  });
});

describe("Ein- und Ausgabe", () => {
  it("liest eingefügte Listen mit Tab, Semikolon oder Komma", () => {
    const parts = parsePartsText("Seite\t652\t600\t2\nBoden; 1962; 600; 1\nTraverse, 1962, 100, 2\nUnsinn\n400;200");
    expect(parts.map((p) => [p.name, p.length, p.width, p.qty])).toEqual([
      ["Seite", 652, 600, 2],
      ["Boden", 1962, 600, 1],
      ["Traverse", 1962, 100, 2],
      ["Teil", 400, 200, 1],
    ]);
  });

  it("schreibt CSV mit Semikolon und maskiert Sonderzeichen", () => {
    const csv = cuttingCsv([part({ name: 'Seite "links"; vorne', length: 652, width: 600, qty: 2, edgesL: 1 })], ZS_DEFAULTS);
    expect(csv.split("\r\n")[1]).toBe('1;"Seite ""links""; vorne";652;600;19;2;1;0;beachten');
  });

  it("Teilen-Link kodiert und dekodiert den Zustand (auch Umlaute)", () => {
    const parts = [part({ name: "Rückwand Größe", length: 2000, width: 652, qty: 1, rotate: true, edgesW: 2 })];
    const code = encodeState(parts, { ...ZS_DEFAULTS, boardPrice: 189 });
    const back = decodeState(code)!;
    expect(back.settings.boardPrice).toBe(189);
    expect(back.parts[0]).toMatchObject({ name: "Rückwand Größe", length: 2000, width: 652, rotate: true, edgesW: 2 });
    expect(decodeState("kaputt!!")).toBeNull();
  });
});
