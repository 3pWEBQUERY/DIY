import { InlineText } from "@/components/blog/inline";
import { parseRichBlocks } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/**
 * Zeigt Text aus dem WYSIWYG-Editor (src/lib/rich-text.ts): Absätze, Aufzählungen, fett, kursiv, Links.
 * Rendert nur React-Elemente – nie rohes HTML.
 */
export function FormattedText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-3 [&_a]:font-medium [&_a]:text-moss-ink [&_a]:underline [&_a]:underline-offset-2", className)}>
      {parseRichBlocks(text).map((b, i) =>
        b.t === "p" ? (
          <p key={i}>
            <InlineText text={b.text} />
          </p>
        ) : b.t === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted">
            {b.items.map((it, k) => (
              <li key={k}>
                <InlineText text={it} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-muted">
            {b.items.map((it, k) => (
              <li key={k}>
                <InlineText text={it} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
