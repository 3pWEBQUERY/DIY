"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { CATEGORIES, VISIBILITY, VISIBILITY_LABEL } from "@werkraum/shared";
import type { PostEditData } from "@/server/social/posts";
import type { CategoryOption } from "@/server/categories/types";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { MediaPicker, type UploadedMedia } from "@/components/media/uploader";
import { removePostAction, savePostAction } from "./actions";

export function PostEditor({ post, projects, categories = CATEGORIES }: { post: PostEditData; projects: { id: string; title: string }[]; categories?: readonly CategoryOption[] }) {
  const router = useRouter();
  const [body, setBody] = useState(post.body);
  const [media, setMedia] = useState<UploadedMedia[]>(
    post.media.map((m) => ({ id: m.id, alt: m.alt, preview: m.preview, state: "ready", progress: 1, kind: m.kind === "VIDEO" ? "VIDEO" : "IMAGE" })),
  );
  const [category, setCategory] = useState(post.category ?? "");
  const [visibility, setVisibility] = useState<string>(post.visibility);
  const [projectId, setProjectId] = useState(post.projectId ?? "");
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const uploading = media.some((m) => m.state === "uploading");
  const missingAlt = media.filter((m) => m.kind === "IMAGE" && m.state === "ready" && !m.alt.trim()).length;
  const dirty =
    body !== post.body ||
    category !== (post.category ?? "") ||
    visibility !== post.visibility ||
    projectId !== (post.projectId ?? "") ||
    JSON.stringify(media.map((m) => [m.id, m.alt])) !== JSON.stringify(post.media.map((m) => [m.id, m.alt]));

  function save() {
    setError(null);
    startSave(async () => {
      const r = await savePostAction(post.id, {
        body,
        category: category || undefined,
        visibility,
        media: media.filter((m) => m.state === "ready").map((m) => ({ id: m.id, alt: m.alt })),
        projectId: projectId || null,
      });
      if (r.ok) {
        toast("Beitrag gespeichert.");
        router.refresh();
      } else setError(r.error);
    });
  }

  function remove() {
    if (!confirm("Diesen Beitrag endgültig löschen? Kommentare und Reaktionen verschwinden ebenfalls aus der Ansicht.")) return;
    startDelete(async () => {
      const r = await removePostAction(post.id);
      if (r.ok) {
        toast("Beitrag gelöscht.");
        router.push("/studio/inhalte");
      } else toast(r.error, "error");
    });
  }

  return (
    <div className="space-y-8">
      {post.repostOf && (
        <Notice title="Geteilter Beitrag">
          Du hast einen fremden Beitrag mit eigener Einordnung geteilt. Bearbeiten kannst du nur deinen Text.
        </Notice>
      )}

      <section aria-labelledby="sec-text">
        <h2 id="sec-text" className="spec mb-3 text-ink">01 — Text</h2>
        <Field label="Beitragstext" hint={`${body.length}/5000 Zeichen · @benutzername erwähnt jemanden`}>
          {(p) => <Textarea {...p} rows={7} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
      </section>

      {!post.repostOf && (
        <section aria-labelledby="sec-media">
          <h2 id="sec-media" className="spec mb-3 text-ink">02 — Fotos & Video</h2>
          <MediaPicker value={media} onChange={setMedia} />
          {missingAlt > 0 && (
            <p className="mt-2 text-xs text-warn">
              {missingAlt === 1 ? "Ein Bild hat" : `${missingAlt} Bilder haben`} noch keine Bildbeschreibung – sie hilft Menschen mit Screenreader.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="sec-meta">
        <h2 id="sec-meta" className="spec mb-3 text-ink">03 — Einordnung</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Kategorie">
            {(p) => (
              <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Ohne Kategorie</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Verknüpftes Projekt">
            {(p) => (
              <Select {...p} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Kein Projekt</option>
                {projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>{pr.title}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Sichtbarkeit" hint={post.community ? "Community-Beiträge sind für Mitglieder sichtbar." : undefined}>
            {(p) => (
              <Select {...p} value={visibility} disabled={!!post.community} onChange={(e) => setVisibility(e.target.value)}>
                {VISIBILITY.map((v) => (
                  <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </section>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper px-4 py-4 sm:mx-0 sm:px-0">
        <Button variant="ghost" onClick={remove} disabled={deleting} className="text-danger hover:bg-danger-soft">
          <Trash2 size={15} /> {deleting ? "Wird gelöscht …" : "Beitrag löschen"}
        </Button>
        <div className="flex items-center gap-3">
          {dirty && <span className="spec">Ungespeicherte Änderungen</span>}
          <Button onClick={save} disabled={!dirty || saving || uploading || (!body.trim() && !media.length && !post.repostOf)}>
            {uploading ? "Lädt hoch …" : saving ? "Speichert …" : "Änderungen speichern"}
          </Button>
        </div>
      </div>
    </div>
  );
}
