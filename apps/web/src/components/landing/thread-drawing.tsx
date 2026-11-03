/**
 * Leichte SVG-Variante des Faden-Motivs (ohne WebGL) für Auth und Fallbacks.
 * Ein durchgehender Faden: Knäuel → Masche → Linie, mit Stichmarken.
 */
export function ThreadDrawing({ className }: { className?: string }) {
  const d =
    "M20 300 C 80 300, 90 220, 150 220 S 230 300, 260 250 S 230 140, 300 130 S 400 190, 360 240 S 260 230, 300 170 S 420 90, 470 150 S 430 280, 380 260 S 360 180, 430 190 S 560 260, 600 300";
  return (
    <svg viewBox="0 0 620 400" className={className} role="img" aria-label="Ein Faden, der sich zu Schlaufen formt">
      <path d="M20 340H600" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 6" />
      <g className="font-mono" fontSize="10" fill="currentColor" opacity="0.55">
        <text x="20" y="362">0</text>
        <text x="300" y="362">300 mm</text>
        <text x="588" y="362">600</text>
      </g>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        style={{ strokeDasharray: 1800, ["--len" as string]: 1800 }}
        className="animate-draw [animation-duration:3.2s]"
      />
      <path d={d} fill="none" stroke="#B46C4D" strokeWidth="1.6" strokeDasharray="1 22" strokeLinecap="round" className="animate-fade [animation-delay:2.4s]" />
      <circle cx="600" cy="300" r="5" fill="#3D604C" className="animate-fade [animation-delay:3s]" />
      <circle cx="20" cy="300" r="3.5" fill="none" stroke="currentColor" />
    </svg>
  );
}
