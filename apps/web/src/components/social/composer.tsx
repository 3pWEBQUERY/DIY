"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, VISIBILITY, VISIBILITY_LABEL } from "@werkraum/shared";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { MediaPicker, type UploadedMedia } from "@/components/media/uploader";
import { createPostAction } from "@/app/(app)/social-actions";
import { cn } from "@/lib/utils";

/**
 * Beitragseditor – so einfach wie in einem modernen sozialen Netzwerk (§5.4, §9.3).
 * Text, mehrere Medien mit Reihenfolge & Alt-Text, Kategorie, optionales Projekt, Sichtbarkeit.
 */
export function Composer({
  viewer,
  projects,
  defaultProjectId,
  compact,
  onPosted,
}: {
  viewer: { displayName: string; avatarUrl: string | null };
  projects: { id: string; title: string }[];
  defaultProjectId?: string;
  compact?: boolean;
  onPosted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [category, setCategory] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [visibility, setVisibility] = useState<(typeof VISIBILITY)[number]>("PUBLIC");
  const [pending, start] = useTransition();
  const uploading = media.some((m) => m.state === "uploading");
  const missingAlt = media.some((m) => m.kind === "IMAGE" && m.state === "ready" && !m.alt.trim());
  const canPost = (body.trim() || media.some((m) => m.state === "ready")) && !uploading;

  function submit() {
    start(async () => {
      const r = await createPostAction({
        body,
        media: media.filter((m) => m.state === "ready").map((m) => ({ id: m.id, alt: m.alt })),
        category: category || undefined,
        projectId: projectId || undefined,
        visibility,
      });
      if (r.ok) {
        toast("Veröffentlicht.");
        setBody("");
        setMedia([]);
        setOpen(!compact);
        onPosted?.();
        router.refresh();
      } else toast(r.error, "error");
    });
  }

  return (
    <section aria-label="Neuer Beitrag" className={cn("border border-line bg-card", open && "border-ink")}>
      <div className="flex gap-3 p-4">
        <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={40} />
        <div className="min-w-0 flex-1">
          <label htmlFor="composer-body" className="sr-only">Was entsteht gerade bei dir?</label>
          <textarea
            id="composer-body"
            value={body}
            onFocus={() => setOpen(true)}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={open ? 3 : 1}
            placeholder="Was entsteht gerade auf deiner Werkbank?"
            className="block w-full resize-none bg-transparent pt-2 text-[16px] leading-relaxed outline-none placeholder:text-muted field-sizing-content"
          />
        </div>
      </div>
      {open && (
        <div className="border-t border-line p-4 animate-fade">
          <MediaPicker value={media} onChange={setMedia} />
          {missingAlt && <p className="mt-2 text-xs text-warn">Tipp: Beschreibe deine Bilder kurz – das hilft Menschen mit Screenreader.</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="spec mb-1 block">Kategorie</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 w-full border border-line-strong bg-card px-2 text-sm">
                <option value="">Ohne Kategorie</option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="spec mb-1 block">Projekt verknüpfen</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-10 w-full border border-line-strong bg-card px-2 text-sm">
                <option value="">Kein Projekt</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="spec mb-1 block">Sichtbarkeit</span>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="h-10 w-full border border-line-strong bg-card px-2 text-sm">
                {VISIBILITY.map((v) => (
                  <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-muted num">{body.length}/5000</span>
            <div className="flex gap-2">
              {compact && (
                <Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
              )}
              <Button onClick={submit} disabled={!canPost || pending}>
                {uploading ? "Lädt hoch …" : pending ? "Veröffentlicht …" : "Veröffentlichen"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
