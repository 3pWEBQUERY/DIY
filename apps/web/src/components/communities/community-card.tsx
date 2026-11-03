import Link from "next/link";
import { Lock, UserCheck } from "lucide-react";
import { COMMUNITY_VISIBILITY_LABEL, categoryBySlug } from "@werkraum/shared";
import { Cover } from "@/components/ui/media";
import { Badge } from "@/components/ui/misc";
import { cn, pluralize } from "@/lib/utils";

export type CommunityCardProps = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  coverUrl: string | null;
  visibility: "PUBLIC" | "REQUEST" | "PRIVATE";
  memberCount: number;
  isFeatured?: boolean;
  region?: string | null;
  viewerState?: "ACTIVE" | "PENDING" | "INVITED" | null;
};

const STATE_BADGE = {
  ACTIVE: { label: "Mitglied", tone: "moss" },
  PENDING: { label: "Angefragt", tone: "outline" },
  INVITED: { label: "Eingeladen", tone: "clay" },
} as const;

/** Community-Karte: `card` (Raster mit Bild) oder `row` (kompakte Zeile). */
export function CommunityCard({ community: c, variant = "card", className }: { community: CommunityCardProps; variant?: "card" | "row"; className?: string }) {
  const cat = categoryBySlug(c.category);
  const state = c.viewerState ? STATE_BADGE[c.viewerState] : null;
  const meta = (
    <span className="spec flex flex-wrap items-center gap-x-2">
      <span>{cat?.short ?? "Community"}</span>
      <span aria-hidden>·</span>
      <span className="inline-flex items-center gap-1">
        {c.visibility === "PRIVATE" && <Lock size={10} aria-hidden />}
        {COMMUNITY_VISIBILITY_LABEL[c.visibility]}
      </span>
      {c.region && (
        <>
          <span aria-hidden>·</span>
          <span>{c.region}</span>
        </>
      )}
    </span>
  );

  if (variant === "row") {
    return (
      <Link href={`/c/${c.slug}`} className={cn("group flex items-center gap-4 py-3", className)}>
        <Cover url={c.coverUrl} alt="" seed={c.id} category={c.category} ratio="1/1" className="w-14 shrink-0 border border-line" sizes="56px" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold group-hover:underline">{c.name}</span>
          {meta}
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-sm num">{c.memberCount}</span>
          <span className="spec">Mitgl.</span>
        </span>
      </Link>
    );
  }

  return (
    <article className={cn("group relative flex flex-col border border-line bg-card transition-colors hover:border-ink", className)}>
      <Cover url={c.coverUrl} alt="" seed={c.id} category={c.category} ratio="16/9" sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw" className="border-b border-line" label={c.name} />
      {c.isFeatured && <span className="absolute left-3 top-3 bg-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-paper">Empfohlen</span>}
      <div className="flex flex-1 flex-col p-4">
        {meta}
        <h3 className="headline mt-1.5 text-[1.3rem]">
          <Link href={`/c/${c.slug}`} className="after:absolute after:inset-0 group-hover:underline">{c.name}</Link>
        </h3>
        {c.description && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{c.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
            <UserCheck size={14} aria-hidden />
            <span className="num">{pluralize(c.memberCount, "Mitglied", "Mitglieder")}</span>
          </span>
          {state && <Badge tone={state.tone}>{state.label}</Badge>}
        </div>
      </div>
    </article>
  );
}
