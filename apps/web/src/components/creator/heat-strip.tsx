import { cn } from "@/lib/utils";

const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * Veröffentlichungsaktivität als Werkbuch-Raster: Spalten = Wochen, Zeilen = Wochentage.
 * Vier diskrete Stufen (keine Verläufe), Zahlen im <title> für Screenreader & Tooltip.
 */
export function HeatStrip({ days, today }: { days: { date: string; n: number }[]; today: string }) {
  const weeks: { date: string; n: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const tone = (n: number) => (n === 0 ? "bg-sunken border-line" : n === 1 ? "bg-moss-soft border-moss/30" : n <= 3 ? "bg-moss border-moss" : "bg-moss-ink border-moss-ink");
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div className="flex gap-3">
      <div className="grid grid-rows-7 gap-[3px] pt-5" aria-hidden>
        {WD.map((w, i) => (
          <span key={w} className={cn("h-3.5 font-mono text-[9px] leading-[14px] text-muted", i % 2 && "invisible")}>
            {w}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-[3px]" role="grid" aria-label="Veröffentlichungen pro Tag, letzte 12 Wochen">
          {weeks.map((w, wi) => (
            <div key={wi} role="row" className="flex flex-col gap-[3px]">
              <span className="h-4 font-mono text-[9px] text-muted" aria-hidden>
                {wi % 3 === 0 ? new Date(`${w[0]!.date}T00:00:00Z`).toLocaleDateString("de-CH", { day: "numeric", month: "numeric", timeZone: "UTC" }) : ""}
              </span>
              {w.map((d) => (
                <span
                  key={d.date}
                  role="gridcell"
                  aria-label={`${fmt(d.date)}: ${d.n} ${d.n === 1 ? "Veröffentlichung" : "Veröffentlichungen"}`}
                  title={`${fmt(d.date)}: ${d.n}`}
                  className={cn("size-3.5 border", d.date > today ? "border-dashed border-line bg-transparent" : tone(d.n), d.date === today && "outline outline-1 outline-offset-1 outline-ink")}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HeatLegend() {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted" aria-hidden>
      weniger
      <span className="size-3 border border-line bg-sunken" />
      <span className="size-3 border border-moss/30 bg-moss-soft" />
      <span className="size-3 border border-moss bg-moss" />
      <span className="size-3 border border-moss-ink bg-moss-ink" />
      mehr
    </span>
  );
}
