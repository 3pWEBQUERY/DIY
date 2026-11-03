/**
 * Formen eines einzigen, durchgehenden Fadens. Jede Funktion liefert N Punkte (x,y,z),
 * die einen zusammenhängenden Pfad bilden – dadurch kann der Faden zwischen den
 * Formen „umgestrickt“ werden, ohne zu reissen.
 *
 *  0 Knäuel   – Entdecken (Häkeln & Stricken)
 *  1 Gefäss   – Erschaffen (Keramik, Wulsttechnik: Schicht für Schicht wie ein Journal)
 *  2 Hocker   – Teilen (Holz, ein Bauplan zum Nachbauen)
 *  3 Faden    – Gemeinsam wachsen (der Projektfaden mit fünf Knoten)
 */
export const N = 1600;
export const NODE_COUNT = 5;

type V3 = [number, number, number];

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function knaeuel(): Float32Array {
  const out = new Float32Array(N * 3);
  const ballEnd = 0.93;
  const tail: V3 = [2.05, -1.25, 0.35];
  let last: V3 = [0, 0, 0];
  const tilt = 0.42;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let p: V3;
    if (t <= ballEnd) {
      const u = t / ballEnd;
      const a = u * Math.PI * 2 * 3.15;
      const b = Math.sin(u * Math.PI * 2 * 41) * (Math.PI / 2) * 0.94;
      const r = 1 + 0.025 * Math.sin(u * Math.PI * 2 * 113);
      const x = Math.cos(a) * Math.cos(b) * r;
      const y = Math.sin(b) * r;
      const z = Math.sin(a) * Math.cos(b) * r;
      // leicht gekippt, damit Wicklungen in mehreren Richtungen sichtbar sind
      p = [x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
      last = p;
    } else {
      const s = smooth((t - ballEnd) / (1 - ballEnd));
      const sag = Math.sin(s * Math.PI) * 0.35;
      p = [last[0] + (tail[0] - last[0]) * s, last[1] + (tail[1] - last[1]) * s - sag, last[2] + (tail[2] - last[2]) * s];
    }
    out.set(p.map((v) => v * 1.12), i * 3);
  }
  return out;
}

const VASE_Y = [-1.2, -0.75, -0.2, 0.35, 0.82, 1.15];
const VASE_R = [0.42, 0.8, 0.92, 0.62, 0.3, 0.44];
function vaseRadius(y: number) {
  for (let k = 0; k < VASE_Y.length - 1; k++) {
    const y0 = VASE_Y[k]!;
    const y1 = VASE_Y[k + 1]!;
    if (y <= y1) {
      const f = (1 - Math.cos(((y - y0) / (y1 - y0)) * Math.PI)) / 2;
      return VASE_R[k]! + (VASE_R[k + 1]! - VASE_R[k]!) * f;
    }
  }
  return VASE_R[VASE_R.length - 1]!;
}

export function gefaess(): Float32Array {
  const out = new Float32Array(N * 3);
  const baseShare = 0.1;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let x: number, y: number, z: number;
    if (t < baseShare) {
      // Boden: Spirale von innen nach aussen
      const u = t / baseShare;
      const a = u * Math.PI * 2 * 6;
      const r = u * VASE_R[0]!;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = VASE_Y[0]!;
    } else {
      const u = (t - baseShare) / (1 - baseShare);
      y = VASE_Y[0]! + u * (VASE_Y[VASE_Y.length - 1]! - VASE_Y[0]!);
      const a = u * Math.PI * 2 * 34 + Math.PI * 2 * 6;
      const r = vaseRadius(y) * (1 + 0.012 * Math.sin(a * 3));
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    out.set([x * 1.1, y * 1.05, z * 1.1], i * 3);
  }
  return out;
}

/** Polylinie gleichmässig neu abtasten. */
function resample(points: V3[], n: number): Float32Array {
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    seg.push(d);
    total += d;
  }
  const out = new Float32Array(n * 3);
  let k = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    while (k < seg.length - 1 && acc + seg[k]! < target) {
      acc += seg[k]!;
      k++;
    }
    const f = seg[k]! === 0 ? 0 : Math.min(1, (target - acc) / seg[k]!);
    const a = points[k]!;
    const b = points[k + 1]!;
    out.set([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], i * 3);
  }
  return out;
}

export function hocker(): Float32Array {
  const top = 0.5;
  const under = 0.36;
  const s = 0.72; // halbe Sitzbreite
  const li = 0.56; // Beinansatz
  const lf = 0.74; // Fussposition (gespreizt)
  const floor = -1.2;
  const st = -0.58; // Zarge/Steg
  const lerp = (a: V3, b: V3, f: number): V3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  const corner = (sx: number, sz: number, y: number, r: number): V3 => [sx * r, y, sz * r];
  const legAt = (sx: number, sz: number, y: number): V3 => {
    const f = (under - y) / (under - floor);
    return lerp(corner(sx, sz, under, li), corner(sx, sz, floor, lf), f);
  };
  const C = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ] as const;
  const pts: V3[] = [];
  // Sitzfläche oben (zweimal umrundet = Kante + Fase)
  for (const [x, z] of [...C, C[0]]) pts.push(corner(x, z, top, s));
  for (const [x, z] of [...C, C[0]]) pts.push(corner(x, z, top - 0.03, s * 0.94));
  // Sitzunterseite
  pts.push(corner(-1, 1, under, s));
  for (const [x, z] of [...C, C[0]]) pts.push(corner(x, z, under, s));
  // Beine + Stege als zusammenhängender Pfad
  const order = [0, 1, 2, 3] as const;
  for (const idx of order) {
    const [x, z] = C[idx]!;
    const [nx, nz] = C[(idx + 1) % 4]!;
    pts.push(corner(x, z, under, li));
    pts.push(legAt(x, z, floor));
    pts.push(legAt(x, z, st));
    pts.push(legAt(nx, nz, st));
    pts.push(legAt(nx, nz, under));
  }
  return resample(pts, N);
}

/** Der Projektfaden: eine sanfte Linie mit fünf Schlaufen (Knoten). */
export function projektfaden(): { points: Float32Array; nodes: V3[] } {
  const out = new Float32Array(N * 3);
  const nodes: V3[] = [];
  const w = 0.045;
  const loopR = 0.17;
  const base = (t: number): V3 => [-1.75 + t * 3.5, Math.sin(t * Math.PI * 2) * 0.22 - 0.05, Math.cos(t * Math.PI * 2) * 0.12];
  const centers = Array.from({ length: NODE_COUNT }, (_, k) => 0.1 + (k * 0.8) / (NODE_COUNT - 1));
  for (const c of centers) {
    const b = base(c);
    nodes.push([b[0], b[1] + loopR, b[2]]);
  }
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const p = base(t);
    for (const c of centers) {
      const s = (t - c) / w;
      if (s > -1 && s < 1) {
        const phase = ((s + 1) / 2) * Math.PI * 2;
        p[0] += Math.sin(phase) * loopR * 0.9 - ((s + 1) / 2 - 0.5) * 0.0;
        p[1] += (1 - Math.cos(phase)) * loopR;
      }
    }
    out.set(p, i * 3);
  }
  return { points: out, nodes };
}

export const SHAPE_SPECS = [
  { title: "Knäuel", spec: ["Baumwollgarn", "300 g", "Nadel 4 mm"] },
  { title: "Gefäss", spec: ["Steinzeug", "Ø 18 cm", "34 Wülste"] },
  { title: "Hocker", spec: ["Eiche massiv", "Sitzhöhe 45 cm", "4 Beine"] },
  { title: "Projektfaden", spec: ["1 Projekt", "5 Verbindungen", "∞ Nachbauten"] },
] as const;
