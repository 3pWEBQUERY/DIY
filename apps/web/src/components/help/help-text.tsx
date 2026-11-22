import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Antworttext des Hilfe-Centers darstellen: Absätze, Aufzählungen („- “), **fett** und [Links](/pfad).
 * Bewusst klein gehalten – die Inhalte stammen aus `lib/help/content.ts`, nicht von Mitgliedern.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      const href = m[2];
      out.push(
        href.startsWith("/") ? (
          <Link key={`${key}-${i++}`} href={href}>
            {m[1]}
          </Link>
        ) : (
          <a key={`${key}-${i++}`} href={href} target="_blank" rel="noopener noreferrer">
            {m[1]}
          </a>
        ),
      );
    } else if (m[3]) {
      out.push(<strong key={`${key}-${i++}`}>{m[3]}</strong>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function HelpText({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        const items = lines.filter((l) => l.startsWith("- "));
        const intro = lines.filter((l) => !l.startsWith("- "));
        return (
          <div key={bi} className="[&+&]:mt-3">
            {intro.length > 0 && <p>{inline(intro.join(" "), `p${bi}`)}</p>}
            {items.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-muted">
                {items.map((l, li) => (
                  <li key={li}>{inline(l.slice(2), `l${bi}-${li}`)}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}
