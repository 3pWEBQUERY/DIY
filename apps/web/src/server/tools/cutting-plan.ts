import { z } from "zod";
import { ZS_DEFAULTS, computeCutting, cuttingCsv, encodeState, type ZsPart, type ZsSettings } from "@/lib/zuschnitt";

/**
 * Zuschnittrechner für die App: dieselbe Berechnung wie im Web (lib/zuschnitt), auf dem Server
 * ausgeführt, damit beide Plattformen exakt gleich packen. Eingaben werden streng begrenzt.
 */
const mm = (max: number) => z.number().finite().min(0).max(max);
const positive = (max: number, msg: string) => z.number().finite().gt(0, msg).max(max);

export const cuttingPlanSchema = z.object({
  parts: z
    .array(
      z.object({
        name: z.string().trim().max(60).default("Teil"),
        length: positive(10000, "Länge fehlt"),
        width: positive(10000, "Breite fehlt"),
        qty: z.number().int().min(1).max(999).default(1),
        edgesL: z.number().int().min(0).max(2).default(0),
        edgesW: z.number().int().min(0).max(2).default(0),
        rotate: z.boolean().default(false),
      }),
    )
    .min(1, "Mindestens ein Teil")
    .max(200, "Höchstens 200 Positionen"),
  settings: z
    .object({
      boardLength: positive(10000, "Plattenlänge fehlt"),
      boardWidth: positive(10000, "Plattenbreite fehlt"),
      thickness: mm(200),
      kerf: mm(20),
      trim: mm(100),
      boardPrice: mm(100000),
      edgePrice: mm(1000),
      edgeReserve: mm(100),
    })
    .partial()
    .default({}),
});

export type CuttingPlanInput = z.input<typeof cuttingPlanSchema>;

/** Gesamtzahl Teile begrenzen (999 × 200 wäre zu viel Rechenzeit) */
export const MAX_PIECES = 2000;

export function cuttingPlan(input: unknown, appUrl: (path: string) => string) {
  const data = cuttingPlanSchema.parse(input);
  const settings: ZsSettings = { ...ZS_DEFAULTS, ...data.settings };
  const parts: ZsPart[] = data.parts.map((p, i) => ({ id: `p${i}`, name: p.name || "Teil", length: p.length, width: p.width, qty: p.qty, edgesL: p.edgesL, edgesW: p.edgesW, rotate: p.rotate }));
  const pieces = parts.reduce((s, p) => s + p.qty, 0);
  if (pieces > MAX_PIECES) throw new z.ZodError([{ code: "custom", path: ["parts"], message: `Höchstens ${MAX_PIECES} Teile insgesamt`, input: pieces }]);
  const result = computeCutting(parts, settings);
  return {
    settings,
    parts,
    result,
    csv: cuttingCsv(parts, settings),
    /** Öffnet denselben Plan im Web (Zustand im URL-Fragment wie beim Teilen-Knopf im Web) */
    shareUrl: appUrl(`/werkzeuge/zuschnitt#d=${encodeState(parts, settings)}`),
  };
}
