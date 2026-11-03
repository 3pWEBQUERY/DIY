/**
 * Kategorie-Glyphen als technische Strichzeichnungen (100×100).
 * Bewusst keine Illustrationen, sondern Werkzeichnungen – passend zum Werkbuch.
 */
export const GLYPHS: Record<string, string> = {
  loop: "M50 18a32 32 0 1 0 0.01 0M24 34c14 6 38 6 52 0M20 52c18 8 42 8 60 0M26 70c14 5 34 5 48 0M38 20c-8 18-8 42 0 60M62 20c8 18 8 42 0 60M76 74c6 6 12 8 18 6",
  stitch: "M14 50h72M22 44l6 12M34 44l6 12M46 44l6 12M58 44l6 12M70 44l6 12M18 82 82 18M78 14l8 8M74 26a4 4 0 1 0 0.01 0",
  grain: "M14 30h72v40H14zM14 42c20-6 30 8 52 0s16 0 20 2M14 56c18 4 26-6 44 0s22 4 28 0M30 30v40",
  chair: "M30 16v48M70 16v48M30 24h40M30 34h40M24 50h52v8H24zM28 58l-4 28M72 58l4 28M38 58l-2 20M62 58l2 20",
  frame: "M18 18h64v64H18zM28 28h44v44H28zM28 64l14-14 10 10 8-8 12 12M60 40a4 4 0 1 0 0.01 0",
  fold: "M50 14 86 50 50 86 14 50zM50 14v72M14 50h72M32 32l36 36",
  ring: "M50 34a24 24 0 1 0 0.01 0M50 42a16 16 0 1 0 0.01 0M42 22l8-10 8 10M44 16h12",
  vessel: "M38 16h24M40 16c0 10-16 16-16 38 0 18 12 30 26 30s26-12 26-30c0-22-16-28-16-38M28 44h44M26 60h48M30 74h40",
  brush: "M70 14 86 30 50 66 34 50zM34 50c-10 0-16 6-16 14 0 8-4 12-8 14 14 4 30 0 32-12M58 22l20 20",
  layers: "M50 18 86 34 50 50 14 34zM14 48l36 16 36-16M14 62l36 16 36-16",
  circuit: "M24 24h52v52H24zM36 36h28v28H36zM24 40h-10M24 60h-10M86 40H76M86 60H76M40 24V14M60 24V14M40 86V76M60 86V76",
  leaf: "M50 86V44M50 44c-22 0-32-14-32-30 20 0 32 12 32 30zM50 58c18 0 28-10 28-26-16 0-28 10-28 26zM36 86h28",
  star: "M50 12l9 26h27l-22 16 8 26-22-16-22 16 8-26-22-16h27z",
  kite: "M50 10 74 40 50 80 26 40zM26 40h48M50 10v70M50 80c-4 6 4 8 0 12",
  spark: "M50 12v24M50 64v24M12 50h24M64 50h24M24 24l14 14M62 62l14 14M76 24 62 38M38 62 24 76",
};

export function Glyph({ name, size = 24, className, strokeWidth = 2.2 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 100 100" className={className}>
      <path d={GLYPHS[name] ?? GLYPHS.spark} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
