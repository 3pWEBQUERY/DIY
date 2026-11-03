/**
 * Minimale Inline-Auszeichnung für Blog-Absätze (§14): **fett**, *kursiv*, [Text](URL).
 * Eigener Parser statt Markdown-Bibliothek: es entsteht nie rohes HTML – nur React-Elemente.
 * Links werden auf http(s), mailto und interne Pfade beschränkt (kein javascript:, data: …).
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "br" }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "a"; href: string; c: Inline[] };

export function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (!url || /\s/.test(url)) return null;
  if (/^https?:\/\/[^/]/i.test(url)) return url;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
}

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "\\" && i + 1 < src.length && "*[]()\\".includes(src[i + 1]!)) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i++;
      continue;
    }
    if (depth < 3 && src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "b", c: parseInline(src.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    if (depth < 3 && ch === "*" && src[i + 1] && src[i + 1] !== " " && src[i + 1] !== "*") {
      let end = -1;
      for (let j = i + 1; j < src.length; j++) {
        if (src[j] === "\n") break;
        if (src[j] !== "*") continue;
        if (src[j + 1] === "*") {
          j++; // fette Markierung innerhalb überspringen
          continue;
        }
        if (src[j - 1] !== " ") {
          end = j;
          break;
        }
      }
      if (end > i + 1) {
        flush();
        out.push({ t: "i", c: parseInline(src.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    if (depth < 3 && ch === "[") {
      const close = src.indexOf("](", i + 1);
      const nl = src.indexOf("\n", i);
      if (close > i + 1 && (nl === -1 || nl > close)) {
        const end = src.indexOf(")", close + 2);
        if (end > close + 2) {
          const href = safeHref(src.slice(close + 2, end));
          if (href) {
            flush();
            out.push({ t: "a", href, c: parseInline(src.slice(i + 1, close), depth + 1) });
            i = end + 1;
            continue;
          }
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** Klartext ohne Auszeichnung – für Suche, Lesedauer, Auszüge. */
export function stripInline(src: string): string {
  const walk = (n: Inline[]): string => n.map((x) => (x.t === "text" ? x.v : x.t === "br" ? "\n" : walk(x.c))).join("");
  return walk(parseInline(src));
}
