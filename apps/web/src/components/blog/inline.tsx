import { Fragment, type ReactNode } from "react";
import { HASHTAG_SOURCE, isHashtagToken } from "@werkraum/shared";
import { isInternalHref, parseInline, type Inline } from "@/lib/inline-marks";
import { HashtagLink } from "@/components/ui/linkify";

export { parseInline, stripInline, safeHref } from "@/lib/inline-marks";

const HASHTAGS = new RegExp(`(${HASHTAG_SOURCE})`, "gu");

/** #Hashtags im Fliesstext klickbar machen (nicht innerhalb eines Links). */
function withHashtags(text: string, key: string): ReactNode {
  if (!text.includes("#")) return text;
  return text.split(HASHTAGS).map((p, i) => (i % 2 === 1 && isHashtagToken(p) ? <HashtagLink key={`${key}#${i}`} tag={p} /> : p));
}

function render(nodes: Inline[], key: string, inLink = false): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    switch (n.t) {
      case "text":
        return inLink ? n.v : <Fragment key={k}>{withHashtags(n.v, k)}</Fragment>;
      case "br":
        return <br key={k} />;
      case "b":
        return <strong key={k} className="font-semibold text-ink">{render(n.c, k, inLink)}</strong>;
      case "i":
        return <em key={k}>{render(n.c, k, inLink)}</em>;
      case "a": {
        const internal = isInternalHref(n.href);
        return internal ? (
          <a key={k} href={n.href}>{render(n.c, k, true)}</a>
        ) : (
          <a key={k} href={n.href} rel="nofollow ugc noopener noreferrer" target="_blank">
            {render(n.c, k, true)}
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
