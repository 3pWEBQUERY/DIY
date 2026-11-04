import Link from "next/link";
import { ArrowUpRight, Info, Lightbulb, TriangleAlert } from "lucide-react";
import { DIFFICULTY_LABEL, PROJECT_STATUS_LABEL, PRODUCT_KIND_LABEL, categoryBySlug, formatMoney, type ArticleBlock, type Currency } from "@werkraum/shared";
import { resolveEmbeds, type ResolvedEmbeds } from "@/server/blog/service";
import { MediaImage, Plate } from "@/components/ui/media";
import { Difficulty } from "@/components/ui/misc";
import { cn, formatMinutes, slugify } from "@/lib/utils";
import { InlineText } from "./inline";

/** Gliederung (h2/h3) mit stabilen Anker-IDs – für Inhaltsverzeichnis und Sprungmarken. */
export function articleOutline(blocks: ArticleBlock[]) {
  const used = new Map<string, number>();
  const out: { blockId: string; anchor: string; text: string; level: 2 | 3 }[] = [];
  for (const b of blocks) {
    if (b.type !== "heading" || !b.text.trim()) continue;
    const base = slugify(b.text, 60);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    out.push({ blockId: b.id, anchor: n ? `${base}-${n + 1}` : base, text: b.text, level: b.level });
  }
  return out;
}

const CALLOUT = {
  info: { label: "Hinweis", icon: Info, cls: "border-line-strong bg-sunken" },
  tip: { label: "Tipp aus der Werkstatt", icon: Lightbulb, cls: "border-moss bg-moss-soft" },
  warning: { label: "Achtung", icon: TriangleAlert, cls: "border-warn bg-warn-soft" },
} as const;

function EmbedShell({ href, kicker, title, meta, cover, accent = "ink", children }: { href: string; kicker: string; title: string; meta?: React.ReactNode; cover: React.ReactNode; accent?: "ink" | "clay"; children?: React.ReactNode }) {
  return (
    <aside className="relative my-10 font-sans">
      <span className={cn("absolute -left-4 top-0 hidden h-full w-px sm:block", accent === "clay" ? "bg-clay" : "bg-ink")} aria-hidden />
      <span className={cn("absolute -left-[19px] top-1/2 hidden size-[7px] -translate-y-1/2 rounded-full sm:block", accent === "clay" ? "bg-clay" : "bg-ink")} aria-hidden />
      <Link href={href} className={cn("group flex items-stretch border bg-card text-ink no-underline transition-colors rounded-2xl", accent === "clay" ? "border-clay/40 hover:border-clay" : "border-line hover:border-ink")}>
        <div className="relative w-28 shrink-0 overflow-hidden border-r border-line sm:w-36">{cover}</div>
        <div className="min-w-0 flex-1 px-4 py-3.5">
          <p className={cn("spec", accent === "clay" && "text-clay-ink")}>{kicker}</p>
          <p className="headline mt-1 text-[1.2rem] leading-snug group-hover:underline">{title}</p>
          {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">{meta}</div>}
          {children}
        </div>
        <ArrowUpRight size={16} className="m-3 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
      </Link>
    </aside>
  );
}

function coverOf(url: string | null, seed: string, category: string | null) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
  ) : (
    <Plate seed={seed} category={category} number={false} />
  );
}

function Block({ b, e, anchor, priority }: { b: ArticleBlock; e: ResolvedEmbeds; anchor?: string; priority?: boolean }) {
  switch (b.type) {
    case "heading":
      return b.level === 2 ? <h2 id={anchor}>{b.text}</h2> : <h3 id={anchor}>{b.text}</h3>;
    case "paragraph":
      return b.text.trim() ? <p><InlineText text={b.text} /></p> : null;
    case "list": {
      const items = b.items.filter((i) => i.trim());
      if (!items.length) return null;
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag>
          {items.map((it, i) => (
            <li key={i}><InlineText text={it} /></li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <figure className="my-10">
          <blockquote className="text-[1.35rem] leading-snug"><InlineText text={b.text} /></blockquote>
          {b.cite && <figcaption className="mt-3 pl-[1.35em]">— {b.cite}</figcaption>}
        </figure>
      );
    case "callout": {
      const c = CALLOUT[b.tone];
      const Icon = c.icon;
      return (
        <aside role="note" aria-label={c.label} className={cn("border-l-2 px-5 py-4 font-sans text-[15.5px] leading-relaxed text-ink-2", c.cls)}>
          <p className="spec mb-1.5 flex items-center gap-1.5 text-ink"><Icon size={13} aria-hidden />{c.label}</p>
          <p><InlineText text={b.text} /></p>
        </aside>
      );
    }
    case "image": {
      const m = e.media.get(b.mediaId);
      if (!m || (m.state !== "READY" && !b.url)) return null;
      return (
        <figure className="-mx-4 my-10 sm:mx-0">
          <div className="bg-sunken" style={m.width && m.height ? { aspectRatio: `${m.width} / ${m.height}` } : undefined}>
            <MediaImage variants={m.variants} url={b.url} alt={b.alt} width={m.width} height={m.height} priority={priority} sizes="(min-width: 768px) 720px, 100vw" className="h-auto object-contain" />
          </div>
          {b.caption && <figcaption className="px-4 sm:px-0">{b.caption}</figcaption>}
        </figure>
      );
    }
    case "gallery": {
      const imgs = b.images.map((i) => ({ ...i, m: e.media.get(i.mediaId) })).filter((i) => i.m && (i.m.state === "READY" || i.url));
      if (!imgs.length) return null;
      const captions = imgs.filter((i) => i.caption);
      return (
        <figure className="-mx-4 my-10 sm:mx-0" role="group" aria-label={`Galerie mit ${imgs.length} Bildern`}>
          <ul className={cn("grid gap-1.5", imgs.length === 1 ? "grid-cols-1" : imgs.length % 3 === 0 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
            {imgs.map((i, n) => (
              <li key={i.mediaId} className="relative m-0 aspect-square overflow-hidden bg-sunken p-0 before:hidden rounded-2xl">
                <MediaImage variants={i.m!.variants} url={i.url} alt={i.alt} sizes="(min-width: 768px) 360px, 50vw" className="absolute inset-0" />
                <span className="absolute left-2 top-2 bg-ink/85 px-1.5 font-mono text-[10px] text-paper rounded-2xl" aria-hidden>{String(n + 1).padStart(2, "0")}</span>
              </li>
            ))}
          </ul>
          {captions.length > 0 && (
            <figcaption className="px-4 sm:px-0">
              {captions.map((c) => `${String(imgs.indexOf(c) + 1).padStart(2, "0")} ${c.caption}`).join(" · ")}
            </figcaption>
          )}
        </figure>
      );
    }
    case "video": {
      const m = e.media.get(b.mediaId);
      const src = m?.variants.video ?? b.url;
      return (
        <figure className="-mx-4 my-10 sm:mx-0">
          {src && m?.state === "READY" ? (
            <video src={src} controls playsInline preload="metadata" className="block w-full bg-ink" aria-label={b.caption || "Video"} />
          ) : (
            <div className="grid aspect-video place-items-center bg-sunken font-sans text-sm text-muted">Video wird noch verarbeitet.</div>
          )}
          {b.caption && <figcaption className="px-4 sm:px-0">{b.caption}</figcaption>}
        </figure>
      );
    }
    case "table": {
      const [head, ...body] = b.rows;
      if (!head) return null;
      return (
        <figure className="my-8 overflow-x-auto">
          <table>
            <thead>
              <tr className="border-b border-ink">
                {head.map((h, i) => (
                  <th key={i} scope="col" className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="font-semibold text-ink">{c}</th> : <td key={j} className="num">{c}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      );
    }
    case "divider":
      return (
        <div className="my-12 flex items-center justify-center gap-4 text-muted" role="separator" aria-hidden>
          <span className="h-px w-16 bg-line-strong" />
          <span className="font-serif text-lg">§</span>
          <span className="h-px w-16 bg-line-strong" />
        </div>
      );
    case "projectCard": {
      const p = e.projects.get(b.projectId);
      if (!p) return null;
      return (
        <EmbedShell
          href={p.href}
          kicker={`Projekt · ${PROJECT_STATUS_LABEL[p.status]}`}
          title={p.title}
          cover={coverOf(p.coverUrl, p.id, p.category)}
          meta={
            <>
              <span>von {p.owner.profile?.displayName}</span>
              <span className="inline-flex items-center gap-1.5"><Difficulty level={p.difficulty} /> {DIFFICULTY_LABEL[p.difficulty]}</span>
              {categoryBySlug(p.category) && <span>{categoryBySlug(p.category)!.short}</span>}
            </>
          }
        />
      );
    }
    case "tutorialCard": {
      const t = e.tutorials.get(b.tutorialId);
      if (!t) return null;
      return (
        <EmbedShell
          href={t.href}
          kicker="Anleitung"
          title={t.title}
          cover={coverOf(t.coverUrl, t.id, t.category)}
          meta={
            <>
              {t.minutes != null && <span>{formatMinutes(t.minutes)}</span>}
              <span className="inline-flex items-center gap-1.5"><Difficulty level={t.difficulty} /> {DIFFICULTY_LABEL[t.difficulty]}</span>
              <span>von {t.author.profile?.displayName}</span>
            </>
          }
        >
          {t.summary && <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-2">{t.summary}</p>}
        </EmbedShell>
      );
    }
    case "productCard": {
      const p = e.products.get(b.productId);
      if (!p) return null;
      return (
        <EmbedShell
          href={p.href}
          accent="clay"
          kicker={`Im Shop von ${p.shop.name}`}
          title={p.title}
          cover={coverOf(p.coverUrl, p.id, p.category)}
          meta={
            <>
              <span className="font-mono font-semibold text-ink">{formatMoney(p.priceMinor, p.currency as Currency)}</span>
              <span>{PRODUCT_KIND_LABEL[p.kind]}</span>
              {p.status === "SOLD_OUT" && <span className="text-clay-ink">Ausverkauft</span>}
            </>
          }
        />
      );
    }
  }
}

/** Server-Renderer für Artikelblöcke – semantisches HTML, Lesetypografie `.prose-werk`. */
export async function ArticleRenderer({ blocks, viewerId, className }: { blocks: ArticleBlock[]; viewerId: string | null; className?: string }) {
  const embeds = await resolveEmbeds(blocks, viewerId);
  const anchors = new Map(articleOutline(blocks).map((o) => [o.blockId, o.anchor]));
  const firstImage = blocks.findIndex((b) => b.type === "image");
  return (
    <div className={cn("prose-werk", className)}>
      {blocks.map((b, i) => (
        <Block key={b.id} b={b} e={embeds} anchor={anchors.get(b.id)} priority={i === firstImage && i < 3} />
      ))}
    </div>
  );
}
