import { stripInline } from "@/lib/inline-marks";

/**
 * Formatierter Text für Produktbeschreibung, Sicherheitshinweise und Rückgabe (Web und iOS gleich).
 *
 * Gespeichert als schlanke Auszeichnung – kein HTML, also nie Skripte oder fremdes Markup:
 * - Zeilen mit „- “ sind Aufzählungspunkte, mit „1. “ nummerierte Punkte
 * - Leerzeile trennt Absätze, einfacher Zeilenumbruch bleibt ein Umbruch
 * - inline: **fett**, *kursiv*, [Text](https://…) (siehe inline-marks.ts)
 *
 * Bisheriger reiner Text ist automatisch gültig und sieht unverändert aus.
 */
export type RichBlock = { t: "p"; text: string } | { t: "ul"; items: string[] } | { t: "ol"; items: string[] };

const BULLET = /^\s*[-•*]\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;

export function parseRichBlocks(src: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", text: para.join("\n") });
    para = [];
  };
  for (const line of src.replace(/\r\n?/g, "\n").split("\n")) {
    const b = BULLET.exec(line);
    const n = b ? null : NUMBER.exec(line);
    if (b || n) {
      flush();
      const t = b ? "ul" : "ol";
      const item = (b ?? n)![1]!;
      const last = blocks[blocks.length - 1];
      if (last && last.t === t) last.items.push(item);
      else blocks.push({ t, items: [item] } as RichBlock);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/** Reiner Text ohne Auszeichnung (Meta-Beschreibungen, Vorschauen, E-Mails). */
export function richToPlain(src: string): string {
  return parseRichBlocks(src)
    .map((b) => (b.t === "p" ? stripInline(b.text) : b.items.map((i, k) => `${b.t === "ol" ? `${k + 1}.` : "•"} ${stripInline(i)}`).join("\n")))
    .join("\n\n");
}
