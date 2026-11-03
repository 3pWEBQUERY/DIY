import { cn } from "@/lib/utils";

/**
 * Inline-SVG-Sparkline ohne Chart-Bibliothek und ohne Verläufe:
 * eine Tintenlinie, Grundlinie als Haarlinie, letzter Wert als Terrakotta-Punkt.
 * `labels` (z.B. Wochenstart) erscheinen als <title> für Screenreader/Tooltip.
 */
export function Sparkline({
  values,
  width = 112,
  height = 32,
  className,
  label,
  labels,
  variant = "line",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  label: string;
  labels?: string[];
  variant?: "line" | "bars";
}) {
  const n = values.length;
  if (!n) return null;
  const max = Math.max(...values, 1);
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const x = (i: number) => pad + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => pad + h - (v / max) * h;
  const last = values[n - 1] ?? 0;
  const summary = `${label}: ${values.join(", ")}`;

  if (variant === "bars") {
    const bw = Math.max(2, w / n - 2);
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0 overflow-visible", className)} role="img" aria-label={summary}>
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} className="stroke-line-strong" strokeWidth={1} />
        {values.map((v, i) => {
          const bh = Math.max(v > 0 ? 1.5 : 0, (v / max) * h);
          return (
            <rect key={i} x={pad + i * (w / n) + 1} y={height - pad - bh} width={bw} height={bh} className={i === n - 1 ? "fill-clay" : "fill-ink"}>
              <title>{`${labels?.[i] ?? `#${i + 1}`}: ${v}`}</title>
            </rect>
          );
        })}
      </svg>
    );
  }

  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0 overflow-visible", className)} role="img" aria-label={summary}>
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} className="stroke-line" strokeWidth={1} />
      <path d={d} fill="none" className="stroke-ink" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(n - 1)} cy={y(last)} r={2.4} className="fill-clay" />
      {labels && <title>{labels.map((l, i) => `${l}: ${values[i]}`).join("\n")}</title>}
    </svg>
  );
}
