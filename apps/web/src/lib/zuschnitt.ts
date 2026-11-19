/**
 * Zuschnittrechner: verteilt rechteckige Teile auf Plattenformate, so wie eine Plattensäge schneidet
 * (Guillotine-Schnitte: jeder Schnitt geht durch die ganze Restplatte). Berücksichtigt Schnittfuge,
 * Randbeschnitt und Maserung (Teile mit Maserung werden nicht gedreht). Alle Masse in mm.
 */

export type ZsPart = {
  id: string;
  name: string;
  /** Länge = Richtung der Maserung bzw. der Plattenlänge */
  length: number;
  width: number;
  qty: number;
  /** Wie viele Längs- und Breitkanten Kantenband bekommen (0–2) */
  edgesL: number;
  edgesW: number;
  /** Darf gedreht werden (keine Maserung) */
  rotate: boolean;
};

export type ZsSettings = {
  boardLength: number;
  boardWidth: number;
  thickness: number;
  kerf: number;
  trim: number;
  /** Preis pro ganze Platte (0 = unbekannt) */
  boardPrice: number;
  /** Preis Kantenband pro Laufmeter (0 = unbekannt) */
  edgePrice: number;
  /** Zuschlag für Kantenband (Überstand, Verschnitt) in Prozent */
  edgeReserve: number;
};

export type Placed = { partId: string; name: string; x: number; y: number; l: number; w: number; rotated: boolean; index: number };
export type Sheet = { placed: Placed[]; usedArea: number };
export type ZsResult = {
  sheets: Sheet[];
  /** Teile, die auf keine Platte passen */
  tooLarge: { name: string; length: number; width: number }[];
  partCount: number;
  partArea: number;
  boardArea: number;
  /** Anteil Verschnitt über alle Platten (0–1) */
  waste: number;
  edgeMeters: number;
  edgeMetersWithReserve: number;
  cuts: number;
  cost: { boards: number; edges: number; total: number };
};

export const ZS_DEFAULTS: ZsSettings = {
  boardLength: 2800,
  boardWidth: 2070,
  thickness: 19,
  kerf: 4,
  trim: 10,
  boardPrice: 0,
  edgePrice: 0,
  edgeReserve: 10,
};

type Free = { x: number; y: number; l: number; w: number };

/** Teile einzeln, grösste zuerst (lange Seite, dann Fläche) – bewährte Reihenfolge für Guillotine-Packen */
function expand(parts: ZsPart[]) {
  const items: { part: ZsPart; index: number }[] = [];
  for (const p of parts) for (let i = 0; i < Math.max(0, Math.floor(p.qty)); i++) items.push({ part: p, index: i + 1 });
  return items.sort((a, b) => Math.max(b.part.length, b.part.width) - Math.max(a.part.length, a.part.width) || b.part.length * b.part.width - a.part.length * a.part.width);
}

/** Bester freier Platz: kürzester Rest an der knapperen Seite (Best Short Side Fit) */
function findSpot(free: Free[], l: number, w: number, canRotate: boolean, kerf: number) {
  let best: { i: number; rotated: boolean; score: number; score2: number } | null = null;
  const tryFit = (i: number, pl: number, pw: number, rotated: boolean) => {
    const f = free[i]!;
    // Schnittfuge nur, wo nach dem Teil noch Platte bleibt
    const needL = pl + (pl < f.l ? kerf : 0);
    const needW = pw + (pw < f.w ? kerf : 0);
    if (pl > f.l || pw > f.w || needL > f.l + kerf || needW > f.w + kerf) return;
    const restL = f.l - pl;
    const restW = f.w - pw;
    const score = Math.min(restL, restW);
    const score2 = Math.max(restL, restW);
    if (!best || score < best.score || (score === best.score && score2 < best.score2)) best = { i, rotated, score, score2 };
  };
  for (let i = 0; i < free.length; i++) {
    tryFit(i, l, w, false);
    if (canRotate && l !== w) tryFit(i, w, l, true);
  }
  return best as { i: number; rotated: boolean } | null;
}

/** Restplatte nach dem Teil in zwei Rechtecke teilen – der grössere Rest bleibt möglichst gross */
function split(f: Free, pl: number, pw: number, kerf: number): Free[] {
  const rightL = f.l - pl - kerf;
  const belowW = f.w - pw - kerf;
  const out: Free[] = [];
  // Längeren Rest durchgehend lassen (Shorter Leftover Axis Split)
  if (rightL * f.w >= f.l * belowW) {
    if (rightL > 0) out.push({ x: f.x + pl + kerf, y: f.y, l: rightL, w: f.w });
    if (belowW > 0) out.push({ x: f.x, y: f.y + pw + kerf, l: pl, w: belowW });
  } else {
    if (belowW > 0) out.push({ x: f.x, y: f.y + pw + kerf, l: f.l, w: belowW });
    if (rightL > 0) out.push({ x: f.x + pl + kerf, y: f.y, l: rightL, w: pw });
  }
  return out;
}

export function computeCutting(parts: ZsPart[], s: ZsSettings): ZsResult {
  const usableL = Math.max(0, s.boardLength - 2 * s.trim);
  const usableW = Math.max(0, s.boardWidth - 2 * s.trim);
  const sheets: { free: Free[]; placed: Placed[]; usedArea: number }[] = [];
  const tooLarge: ZsResult["tooLarge"] = [];
  let cuts = 0;

  for (const { part, index } of expand(parts.filter((p) => p.length > 0 && p.width > 0))) {
    const fitsBoard = (part.length <= usableL && part.width <= usableW) || (part.rotate && part.width <= usableL && part.length <= usableW);
    if (!fitsBoard) {
      if (!tooLarge.some((t) => t.name === part.name && t.length === part.length && t.width === part.width)) tooLarge.push({ name: part.name, length: part.length, width: part.width });
      continue;
    }
    let placed = false;
    for (const sheet of sheets) {
      const spot = findSpot(sheet.free, part.length, part.width, part.rotate, s.kerf);
      if (!spot) continue;
      place(sheet, spot.i, spot.rotated);
      placed = true;
      break;
    }
    if (!placed) {
      const sheet = { free: [{ x: s.trim, y: s.trim, l: usableL, w: usableW }], placed: [] as Placed[], usedArea: 0 };
      sheets.push(sheet);
      const spot = findSpot(sheet.free, part.length, part.width, part.rotate, s.kerf)!;
      place(sheet, spot.i, spot.rotated);
    }

    function place(sheet: { free: Free[]; placed: Placed[]; usedArea: number }, i: number, rotated: boolean) {
      const f = sheet.free[i]!;
      const pl = rotated ? part.width : part.length;
      const pw = rotated ? part.length : part.width;
      sheet.placed.push({ partId: part.id, name: part.name, x: f.x, y: f.y, l: pl, w: pw, rotated, index });
      sheet.usedArea += pl * pw;
      sheet.free.splice(i, 1, ...split(f, pl, pw, s.kerf));
      // Schnitte: je ein Schnitt pro Seite, an der noch Platte übrig bleibt
      cuts += (pl < f.l ? 1 : 0) + (pw < f.w ? 1 : 0);
    }
  }

  const partArea = sheets.reduce((a, sh) => a + sh.usedArea, 0) / 1e6;
  const boardArea = (sheets.length * s.boardLength * s.boardWidth) / 1e6;
  const edgeMeters =
    parts.reduce((a, p) => a + Math.max(0, Math.floor(p.qty)) * (clampEdges(p.edgesL) * p.length + clampEdges(p.edgesW) * p.width), 0) / 1000;
  const edgeMetersWithReserve = edgeMeters * (1 + Math.max(0, s.edgeReserve) / 100);
  const boardsCost = sheets.length * Math.max(0, s.boardPrice);
  const edgesCost = edgeMetersWithReserve * Math.max(0, s.edgePrice);
  return {
    sheets: sheets.map(({ placed, usedArea }) => ({ placed, usedArea })),
    tooLarge,
    partCount: sheets.reduce((a, sh) => a + sh.placed.length, 0),
    partArea,
    boardArea,
    waste: boardArea ? 1 - partArea / boardArea : 0,
    edgeMeters,
    edgeMetersWithReserve,
    cuts,
    cost: { boards: boardsCost, edges: edgesCost, total: boardsCost + edgesCost },
  };
}

const clampEdges = (n: number) => Math.min(2, Math.max(0, Math.floor(n || 0)));

/** Zuschnittliste als CSV (Semikolon, für Excel im deutschsprachigen Raum) */
export function cuttingCsv(parts: ZsPart[], s: ZsSettings) {
  const head = ["Pos.", "Bezeichnung", "Länge (mm)", "Breite (mm)", "Stärke (mm)", "Stück", "Kanten Länge", "Kanten Breite", "Maserung"];
  const esc = (v: string | number) => {
    const t = String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = parts.map((p, i) => [i + 1, p.name, p.length, p.width, s.thickness, p.qty, clampEdges(p.edgesL), clampEdges(p.edgesW), p.rotate ? "drehbar" : "beachten"]);
  return [head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

/** Teileliste aus eingefügtem Text: „Name; Länge; Breite; Stück“ (Tab, Semikolon oder Komma) */
export function parsePartsText(text: string): Omit<ZsPart, "id">[] {
  const out: Omit<ZsPart, "id">[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/\t|;|,(?=\s*\d)/).map((c) => c.trim());
    if (cells.length < 2) continue;
    const nums = cells.map((c) => Number(c.replace(/[^\d.]/g, "")));
    // Erste Zelle Text → Name; sonst „Teil“
    const hasName = isNaN(Number(cells[0])) || cells[0] === "";
    if (hasName && cells.length < 3) continue;
    const [l, w, q] = hasName ? [nums[1], nums[2], nums[3]] : [nums[0], nums[1], nums[2]];
    if (!l || !w || l > 10000 || w > 10000) continue;
    out.push({ name: hasName ? cells[0]!.slice(0, 60) : "Teil", length: Math.round(l), width: Math.round(w), qty: q && q > 0 && q < 1000 ? Math.round(q) : 1, edgesL: 0, edgesW: 0, rotate: false });
  }
  return out;
}

/** Zustand kompakt für einen Teilen-Link (URL-Fragment) */
export function encodeState(parts: ZsPart[], s: ZsSettings) {
  const data = { s, p: parts.map((p) => [p.name, p.length, p.width, p.qty, p.edgesL, p.edgesW, p.rotate ? 1 : 0]) };
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeState(code: string): { parts: ZsPart[]; settings: ZsSettings } | null {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const d = JSON.parse(json) as { s?: Partial<ZsSettings>; p?: unknown[] };
    if (!Array.isArray(d.p) || d.p.length > 500) return null;
    const num = (v: unknown, max: number, def = 0) => (typeof v === "number" && isFinite(v) && v >= 0 && v <= max ? v : def);
    const settings: ZsSettings = {
      boardLength: num(d.s?.boardLength, 10000, ZS_DEFAULTS.boardLength),
      boardWidth: num(d.s?.boardWidth, 10000, ZS_DEFAULTS.boardWidth),
      thickness: num(d.s?.thickness, 200, ZS_DEFAULTS.thickness),
      kerf: num(d.s?.kerf, 20, ZS_DEFAULTS.kerf),
      trim: num(d.s?.trim, 100, ZS_DEFAULTS.trim),
      boardPrice: num(d.s?.boardPrice, 100000),
      edgePrice: num(d.s?.edgePrice, 1000),
      edgeReserve: num(d.s?.edgeReserve, 100, ZS_DEFAULTS.edgeReserve),
    };
    const parts = d.p
      .filter((r): r is unknown[] => Array.isArray(r))
      .map((r, i) => ({
        id: `p${i}`,
        name: typeof r[0] === "string" ? r[0].slice(0, 60) : "Teil",
        length: num(r[1], 10000),
        width: num(r[2], 10000),
        qty: Math.max(1, Math.round(num(r[3], 999, 1))),
        edgesL: clampEdges(num(r[4], 2)),
        edgesW: clampEdges(num(r[5], 2)),
        rotate: r[6] === 1,
      }));
    return { parts, settings };
  } catch {
    return null;
  }
}
