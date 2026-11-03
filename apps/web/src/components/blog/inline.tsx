import type { ReactNode } from "react";
import { parseInline, type Inline } from "@/lib/inline-marks";

export { parseInline, stripInline, safeHref } from "@/lib/inline-marks";

function render(nodes: Inline[], key: string): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    switch (n.t) {
      case "text":
        return n.v;
      case "br":
        return <br key={k} />;
      case "b":
        return <strong key={k} className="font-semibold text-ink">{render(n.c, k)}</strong>;
      case "i":
        return <em key={k}>{render(n.c, k)}</em>;
      case "a": {
        const internal = n.href.startsWith("/");
        return internal ? (
          <a key={k} href={n.href}>{render(n.c, k)}</a>
        ) : (
          <a key={k} href={n.href} rel="nofollow ugc noopener noreferrer" target="_blank">
            {render(n.c, k)}
          </a>
        );
      }
    }
  });
}

/** Rendert Text mit Inline-Auszeichnung sicher als React-Knoten. */
export function InlineText({ text }: { text: string }) {
  return <>{render(parseInline(text), "r")}</>;
}
