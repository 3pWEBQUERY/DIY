"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Eye, History, ImagePlus, LoaderCircle, Send, Trash2, X } from "lucide-react";
import type { ArticleBlock } from "@werkraum/shared";
import { BlockEditor, sanitizeBlocks } from "./block-editor";
import { uploadFile } from "@/components/media/uploader";
import { Button } from "@/components/ui/button";
import { Badge, Kbd } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Label, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cn, formatDate, pad, readingMinutes, relativeTime, slugify } from "@/lib/utils";
import { stripInline } from "@/lib/inline-marks";
import {
  deleteArticleAction,
  listRevisionsAction,
  publishArticleAction,
  restoreRevisionAction,
  saveArticleAction,
  unpublishArticleAction,
} from "@/app/studio/blog/actions";
import { TagInput } from "@/components/ui/tag-input";

type Initial = {
  id: string;
  slug: string;
  title: string;
  dek: string;
  coverUrl: string | null;
  blocks: ArticleBlock[];
  categoryId: string | null;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  commentsEnabled: boolean;
  projectIds: string[];
  state: "DRAFT" | "PUBLISHED" | "SCHEDULED" | "HIDDEN" | "REMOVED";
  publishedAt: string | null;
  updatedAt: string;
  everPublished: boolean;
};

type Revision = { id: string; title: string; createdAt: string; blockCount: number; words: number };

const STATE_LABEL = { DRAFT: "Entwurf", PUBLISHED: "Veröffentlicht", SCHEDULED: "Geplant", HIDDEN: "Ausgeblendet", REMOVED: "Entfernt" } as const;
const STATE_TONE = { DRAFT: "outline", PUBLISHED: "moss", SCHEDULED: "clay", HIDDEN: "danger", REMOVED: "danger" } as const;

function Counter({ n, max, warnAt }: { n: number; max: number; warnAt?: number }) {
  return (
    <span className={cn("font-mono text-[11px] num", n > max ? "text-danger" : warnAt && n > warnAt ? "text-warn" : "text-muted")} aria-live="polite">
      {n}/{max}
    </span>
  );
}

function plainFromBlocks(blocks: ArticleBlock[]) {
  return blocks
    .map((b) => (b.type === "paragraph" || b.type === "callout" || b.type === "quote" ? stripInline(b.text) : b.type === "heading" ? b.text : b.type === "list" ? b.items.join(" ") : ""))
    .join(" ");
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ArticleEditor({
  initial,
  categories,
  projects,
  handle,
  baseUrl,
}: {
  initial: Initial | null;
  categories: { id: string; name: string }[];
  projects: { id: string; title: string }[];
  handle: string;
  baseUrl: string;
}) {
  const router = useRouter();
  const [id, setId] = useState(initial?.id ?? null);
  const [state, setState] = useState<Initial["state"]>(initial?.state ?? "DRAFT");
  const [publishedAt, setPublishedAt] = useState(initial?.publishedAt ?? null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [dek, setDek] = useState(initial?.dek ?? "");
  const [blocks, setBlocks] = useState<ArticleBlock[]>(initial?.blocks ?? []);
  const [slug, setSlug] = useState(initial?.slug ?? "");
  // Adresse folgt dem Titel, bis sie von Hand gesetzt oder der Artikel veröffentlicht wurde
  const [slugTouched, setSlugTouched] = useState(() => {
    if (!initial) return false;
    if (initial.everPublished) return true;
    const auto = slugify(initial.title, 72);
    return initial.slug !== auto && !new RegExp(`^${auto}-\\d+$`).test(initial.slug);
  });
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [commentsEnabled, setCommentsEnabled] = useState(initial?.commentsEnabled ?? true);
  const [projectIds, setProjectIds] = useState<string[]>(initial?.projectIds ?? []);
  const [cover, setCover] = useState<{ url: string | null; mediaId?: string | null }>({ url: initial?.coverUrl ?? null });
  const [coverProgress, setCoverProgress] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [publishOpen, setPublishOpen] = useState(false);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [saving, startSave] = useTransition();
  const [acting, startAct] = useTransition();
  const everPublished = initial?.everPublished || state === "PUBLISHED";
  const coverInput = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const version = useRef(0);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    version.current++;
    setDirty(true);
  };

  const autoSlug = slugify(title || "artikel", 72);
  const effectiveSlug = slugTouched ? slug : slug && new RegExp(`^${autoSlug}(-\\d+)?$`).test(slug) ? slug : autoSlug;
  const minutes = useMemo(() => readingMinutes(`${title} ${dek} ${plainFromBlocks(blocks)}`), [title, dek, blocks]);
  const seoT = seoTitle || title;
  const seoD = seoDescription || dek;

  const payload = useCallback(
    () => ({
      title,
      slug: slugTouched ? slug : "",
      dek,
      ...(cover.mediaId !== undefined ? { coverMediaId: cover.mediaId } : {}),
      blocks: sanitizeBlocks(blocks),
      categoryId: categoryId || null,
      tags,
      seoTitle,
      seoDescription,
      commentsEnabled,
      projectIds,
    }),
    [title, slug, slugTouched, dek, cover.mediaId, blocks, categoryId, tags, seoTitle, seoDescription, commentsEnabled, projectIds],
  );

  const save = useCallback(
    (opts: { quiet?: boolean } = {}) =>
      new Promise<string | null>((resolve) => {
        if (title.trim().length < 3) {
          setFieldErrors({ title: "Gib deinem Artikel einen Titel (mind. 3 Zeichen)." });
          if (!opts.quiet) titleRef.current?.focus();
          return resolve(null);
        }
        const v = version.current;
        startSave(async () => {
          const r = await saveArticleAction(id, payload());
          if (r.ok) {
            setFieldErrors({});
            if (version.current === v) setDirty(false);
            setSavedAt(r.data.updatedAt);
            setSlug(r.data.slug);
            setCover((c) => ({ url: r.data.coverUrl ?? (c.mediaId === null ? null : c.url) }));
            if (!opts.quiet) toast("Gespeichert.");
            if (!id) {
              setId(r.data.id);
              router.replace(`/studio/blog/${r.data.id}`);
            }
            setRevisions(null);
            resolve(r.data.id);
          } else {
            setFieldErrors(r.fields ?? {});
            if (!opts.quiet || r.code !== "VALIDATION") toast(r.error, "error");
            resolve(null);
          }
        });
      }),
    [id, payload, router, title],
  );

  // ⌘S / Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // Automatisch speichern: 15 s nach der letzten Änderung (nur bestehende Artikel)
  useEffect(() => {
    if (!dirty || !id || saving || coverProgress !== null) return;
    const t = setTimeout(() => void save({ quiet: true }), 15_000);
    return () => clearTimeout(t);
  }, [dirty, id, saving, save, coverProgress, blocks, title, dek]);

  // Warnung beim Verlassen mit ungespeicherten Änderungen
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function onCover(file: File | undefined) {
    if (!file) return;
    setCoverProgress(0);
    try {
      const r = await uploadFile(file, "public", setCoverProgress);
      touch(setCover)({ url: r.variants?.lg ?? r.variants?.md ?? URL.createObjectURL(file), mediaId: r.mediaId });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload fehlgeschlagen", "error");
    } finally {
      setCoverProgress(null);
    }
  }


  async function loadRevisions() {
    if (!id) return;
    const r = await listRevisionsAction(id);
    if (r.ok) setRevisions(r.data);
    else toast(r.error, "error");
  }

  function restore(rev: Revision) {
    if (!id) return;
    if (dirty && !confirm("Du hast ungespeicherte Änderungen. Trotzdem diese Revision wiederherstellen?")) return;
    if (!dirty && !confirm(`Revision vom ${formatDate(rev.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} wiederherstellen?`)) return;
    startAct(async () => {
      const r = await restoreRevisionAction(id, rev.id);
      if (r.ok) {
        setTitle(r.data.title);
        setBlocks(r.data.blocks);
        setDirty(false);
        setSavedAt(new Date().toISOString());
        toast("Revision wiederhergestellt.");
        await loadRevisions();
      } else toast(r.error, "error");
    });
  }

  const previewHref = id ? `/u/${handle}/blog/${effectiveSlug}${state === "PUBLISHED" ? "" : "?vorschau=1"}` : null;

  return (
    <div>
      {/* Kopfleiste */}
      <div className="sticky top-14 z-20 -mx-4 mb-8 flex flex-wrap items-center gap-3 border-b border-line bg-paper px-4 py-3 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <Link href="/studio/blog" className="text-sm text-muted hover:text-ink">Blog</Link>
        <span className="text-line-strong">/</span>
        <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
        {state === "SCHEDULED" && publishedAt && <span className="spec">am {formatDate(publishedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        <span className="text-xs text-muted" aria-live="polite">
          {saving ? "Speichert …" : dirty ? "Ungespeicherte Änderungen" : savedAt ? `Gespeichert ${relativeTime(savedAt)}` : "Noch nicht gespeichert"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {previewHref && (
            <Link href={previewHref} target="_blank" className="inline-flex h-9 items-center gap-1.5 px-2 text-sm text-muted hover:text-ink rounded-xl">
              <Eye size={15} /> Vorschau
            </Link>
          )}
          <Button variant="outline" onClick={() => void save()} disabled={saving}>
            {saving ? <LoaderCircle size={15} className="animate-spin" /> : null}
            {state === "PUBLISHED" ? "Aktualisieren" : "Speichern"} <Kbd>⌘S</Kbd>
          </Button>
          {state === "PUBLISHED" || state === "SCHEDULED" ? (
            <Button
              variant="ghost"
              disabled={acting || !id}
              onClick={() =>
                id &&
                confirm(state === "SCHEDULED" ? "Planung aufheben und zum Entwurf machen?" : "Artikel offline nehmen? Er ist dann nur noch für dich sichtbar.") &&
                startAct(async () => {
                  const r = await unpublishArticleAction(id);
                  if (r.ok) {
                    setState("DRAFT");
                    if (state === "SCHEDULED") setPublishedAt(null);
                    toast(r.message ?? "Zurück im Entwurf.");
                    router.refresh();
                  } else toast(r.error, "error");
                })
              }
            >
              {state === "SCHEDULED" ? "Planung aufheben" : "Offline nehmen"}
            </Button>
          ) : null}
          {state !== "PUBLISHED" && state !== "HIDDEN" && (
            <Button onClick={() => setPublishOpen(true)} disabled={acting}>
              <Send size={15} /> {state === "SCHEDULED" ? "Planung ändern" : "Veröffentlichen"}
            </Button>
          )}
        </div>
      </div>

      {state === "HIDDEN" && (
        <p role="alert" className="rounded-2xl mb-6 bg-danger-soft px-4 py-3 text-sm">Dieser Artikel wurde von der Moderation ausgeblendet. Details findest du in deinen Benachrichtigungen.</p>
      )}

      <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Schreibfläche */}
        <div className="min-w-0">
          <div className="mx-auto max-w-[720px]">
            <p className="spec mb-3 flex items-center gap-2"><span className="inline-block h-px w-6 bg-rule-strong" />Artikel · {minutes} Min. Lesezeit</p>
            <label htmlFor="article-title" className="sr-only">Titel</label>
            <textarea
              id="article-title"
              ref={titleRef}
              value={title}
              rows={1}
              maxLength={160}
              autoFocus={!initial}
              onChange={(e) => touch(setTitle)(e.target.value.replace(/\n/g, " "))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById("article-dek")?.focus();
                }
              }}
              placeholder="Titel deines Artikels"
              aria-invalid={!!fieldErrors.title || undefined}
              aria-describedby={fieldErrors.title ? "title-err" : undefined}
              className="display block w-full resize-none bg-transparent text-[2.5rem] text-ink outline-none placeholder:text-muted/40 field-sizing-content sm:text-[3.25rem]"
            />
            {fieldErrors.title && <p id="title-err" role="alert" className="mt-1 text-sm text-danger">{fieldErrors.title}</p>}
            <label htmlFor="article-dek" className="sr-only">Vorspann</label>
            <textarea
              id="article-dek"
              value={dek}
              rows={1}
              maxLength={400}
              onChange={(e) => touch(setDek)(e.target.value)}
              placeholder="Vorspann – zwei Sätze, die Lust aufs Weiterlesen machen."
              className="mt-4 block w-full resize-none bg-transparent text-xl font-medium leading-snug text-ink-2 outline-none placeholder:text-muted/50 field-sizing-content"
            />
            <div className="mt-1 flex justify-end"><Counter n={dek.length} max={400} warnAt={300} /></div>
            <div className="mt-6 border-t border-rule pt-8">
              <BlockEditor blocks={blocks} onChange={touch(setBlocks)} label="Artikelinhalt" />
            </div>
          </div>
        </div>

        {/* Metadaten */}
        <aside className="space-y-9 xl:sticky xl:top-32 xl:h-fit xl:max-h-[calc(100dvh-9rem)] xl:overflow-y-auto xl:pr-1" aria-label="Artikeleinstellungen">
          <section aria-labelledby="m-cover">
            <h2 id="m-cover" className="mb-3 flex items-baseline gap-3 border-b border-rule pb-2 text-[14px] font-bold"><span className="spec text-ink">01</span>Titelbild</h2>
            {cover.url ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover.url} alt="Titelbild" className="aspect-[16/9] w-full border border-line object-cover rounded-2xl" />
                <div className="mt-2 flex gap-3 text-xs">
                  <button type="button" onClick={() => coverInput.current?.click()} className="font-semibold hover:underline">Ersetzen</button>
                  <button type="button" onClick={() => touch(setCover)({ url: null, mediaId: null })} className="text-muted hover:text-danger">Entfernen</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => coverInput.current?.click()} disabled={coverProgress !== null} className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 border border-dashed border-line-strong text-sm text-muted hover:border-rule-strong hover:text-ink rounded-2xl">
                {coverProgress !== null ? <><LoaderCircle size={18} className="animate-spin" /><span className="font-mono text-xs">{Math.round(coverProgress * 100)} %</span></> : <><ImagePlus size={20} strokeWidth={1.5} /> Titelbild hochladen</>}
              </button>
            )}
            <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/avif" hidden onChange={(e) => onCover(e.target.files?.[0])} />
            <p className="mt-2 text-xs text-muted">Querformat 16:9, mind. 1600 px breit. Wird auch beim Teilen angezeigt.</p>
          </section>

          <section aria-labelledby="m-class">
            <h2 id="m-class" className="mb-3 flex items-baseline gap-3 border-b border-rule pb-2 text-[14px] font-bold"><span className="spec text-ink">02</span>Einordnung</h2>
            <Label htmlFor="m-category">Rubrik</Label>
            <Select id="m-category" value={categoryId} onChange={(e) => touch(setCategoryId)(e.target.value)}>
              <option value="">Ohne Rubrik</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Label htmlFor="m-tags" className="mt-4">Schlagwörter</Label>
            <TagInput id="m-tags" value={tags} onChange={touch(setTags)} max={10} normalize={(raw) => slugify(raw.replace(/^#/, ""), 30)} placeholder="z. B. eiche – dann Enter" />
          </section>

          <section aria-labelledby="m-seo">
            <h2 id="m-seo" className="mb-3 flex items-baseline gap-3 border-b border-rule pb-2 text-[14px] font-bold"><span className="spec text-ink">03</span>Adresse & Suchmaschinen</h2>
            <Label htmlFor="m-slug">Adresse</Label>
            <div className="flex items-center border border-line-strong bg-card focus-within:border-moss rounded-2xl">
              <span className="truncate pl-3 font-mono text-[11px] text-muted">/u/{handle}/blog/</span>
              <input
                id="m-slug"
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  touch(setSlug)(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-"));
                }}
                onBlur={() => setSlug((s) => slugify(s || title, 80))}
                aria-invalid={!!fieldErrors.slug || undefined}
                className="h-11 min-w-0 flex-1 bg-transparent pr-3 font-mono text-[13px] outline-none"
              />
            </div>
            {fieldErrors.slug ? <p role="alert" className="mt-1 text-xs text-danger">{fieldErrors.slug}</p> : everPublished && <p className="mt-1.5 text-xs text-muted">Ändern ist möglich – alte Links leiten automatisch weiter.</p>}

            <div className="mt-4 flex items-baseline justify-between">
              <Label htmlFor="m-seot" className="mb-0">SEO-Titel</Label>
              <Counter n={seoTitle.length} max={70} warnAt={60} />
            </div>
            <input id="m-seot" value={seoTitle} maxLength={70} onChange={(e) => touch(setSeoTitle)(e.target.value)} placeholder={title || "Standard: Artikeltitel"} className="mt-1.5 h-11 w-full border border-line-strong bg-card px-3 text-[15px] outline-none focus:border-moss rounded-2xl" />

            <div className="mt-4 flex items-baseline justify-between">
              <Label htmlFor="m-seod" className="mb-0">SEO-Beschreibung</Label>
              <Counter n={seoDescription.length} max={170} warnAt={155} />
            </div>
            <textarea id="m-seod" value={seoDescription} maxLength={170} rows={3} onChange={(e) => touch(setSeoDescription)(e.target.value)} placeholder={dek || "Standard: Vorspann"} className="mt-1.5 w-full resize-none border border-line-strong bg-card px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-moss rounded-2xl" />

            <figure className="mt-4 border border-line bg-card p-4 rounded-2xl" aria-label="Vorschau in Suchergebnissen">
              <figcaption className="spec mb-2">Vorschau Suchergebnis</figcaption>
              <p className="truncate text-[12px] text-ink-2">{baseUrl.replace(/^https?:\/\//, "")} › u › {handle} › blog › {effectiveSlug}</p>
              <p className="mt-0.5 line-clamp-1 text-[18px] leading-snug text-[#1a0dab]">{(seoT || "Titel deines Artikels").slice(0, 60)}{seoT.length > 60 ? " …" : ""}</p>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">
                {publishedAt && state === "PUBLISHED" ? `${formatDate(publishedAt, { day: "numeric", month: "short", year: "numeric" })} — ` : ""}
                {(seoD || "Beschreibe in ein bis zwei Sätzen, worum es geht.").slice(0, 158)}{seoD.length > 158 ? " …" : ""}
              </p>
            </figure>
          </section>

          {projects.length > 0 && (
            <section aria-labelledby="m-proj">
              <h2 id="m-proj" className="mb-3 flex items-baseline gap-3 border-b border-rule pb-2 text-[14px] font-bold"><span className="spec text-ink">04</span>Verknüpfte Projekte</h2>
              <ul className="max-h-56 space-y-2 overflow-y-auto border-l border-rule pl-3">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Checkbox
                      label={p.title}
                      checked={projectIds.includes(p.id)}
                      onChange={(e) => touch(setProjectIds)(e.target.checked ? [...projectIds, p.id].slice(0, 12) : projectIds.filter((x) => x !== p.id))}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Der Artikel erscheint dann im Projektfaden.</p>
            </section>
          )}

          <section aria-labelledby="m-opt">
            <h2 id="m-opt" className="mb-3 flex items-baseline gap-3 border-b border-rule pb-2 text-[14px] font-bold"><span className="spec text-ink">{projects.length ? "05" : "04"}</span>Optionen</h2>
            <Checkbox label="Kommentare erlauben" checked={commentsEnabled} onChange={(e) => touch(setCommentsEnabled)(e.target.checked)} />
          </section>

          {id && (
            <section aria-labelledby="m-rev">
              <h2 id="m-rev" className="mb-3 flex items-baseline justify-between gap-3 border-b border-rule pb-2 text-[14px] font-bold">
                <span className="flex items-baseline gap-3"><span className="spec text-ink">{projects.length ? "06" : "05"}</span>Revisionen</span>
                {revisions === null && (
                  <button type="button" onClick={loadRevisions} className="inline-flex items-center gap-1 text-xs font-normal text-muted hover:text-ink"><History size={13} /> Anzeigen</button>
                )}
              </h2>
              {revisions && (
                <ol className="divide-y divide-line">
                  {revisions.length === 0 && <li className="py-2 text-sm text-muted">Noch keine Revisionen.</li>}
                  {revisions.map((r, i) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold num">{formatDate(r.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{i === 0 && <span className="spec ml-2 text-moss">aktuell</span>}</p>
                        <p className="truncate text-xs text-muted">{r.title} · {r.words} Wörter · {r.blockCount} Blöcke</p>
                      </div>
                      {i > 0 && <button type="button" disabled={acting} onClick={() => restore(r)} className="shrink-0 text-xs font-semibold hover:underline">Wiederherstellen</button>}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-2 text-xs text-muted">Jede Speicherung legt eine Revision an. Die letzten 30 bleiben erhalten.</p>
            </section>
          )}

          {id && (
            <section className="border-t border-line pt-4">
              <button
                type="button"
                disabled={acting}
                onClick={() =>
                  confirm("Artikel endgültig löschen? Das kann nicht rückgängig gemacht werden.") &&
                  startAct(async () => {
                    const r = await deleteArticleAction(id);
                    if (r.ok) {
                      setDirty(false);
                      toast("Artikel gelöscht.");
                      router.push("/studio/blog");
                    } else toast(r.error, "error");
                  })
                }
                className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-danger"
              >
                <Trash2 size={14} /> Artikel löschen
              </button>
            </section>
          )}
        </aside>
      </div>

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        scheduledAt={state === "SCHEDULED" ? publishedAt : null}
        canSchedule={!everPublished}
        onConfirm={async (opts) => {
          const savedId = dirty || !id ? await save({ quiet: true }) : id;
          if (!savedId) return false;
          const r = await publishArticleAction(savedId, opts);
          if (!r.ok) {
            toast(r.error, "error");
            return false;
          }
          setState(r.data.state);
          setPublishedAt(r.data.publishedAt);
          toast(r.data.state === "SCHEDULED" ? `Geplant für ${formatDate(r.data.publishedAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.` : "Veröffentlicht.");
          router.refresh();
          return true;
        }}
      />
    </div>
  );
}

function PublishDialog({
  open,
  onClose,
  onConfirm,
  scheduledAt,
  canSchedule,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (o: { publishAt?: string; shareToFeed: boolean }) => Promise<boolean>;
  scheduledAt: string | null;
  canSchedule: boolean;
}) {
  const [mode, setMode] = useState<"now" | "later">(scheduledAt ? "later" : "now");
  const [when, setWhen] = useState(toLocalInput(scheduledAt));
  const [share, setShare] = useState(true);
  const [pending, start] = useTransition();
  const minLocal = toLocalInput(new Date(Date.now() + 5 * 60_000).toISOString());
  const valid = mode === "now" || (when && new Date(when).getTime() > Date.now() + 60_000);
  return (
    <Dialog open={open} onClose={onClose} title="Veröffentlichen" description="Dein Artikel wird öffentlich auf deinem Blog und unter /blogs sichtbar.">
      <fieldset className="space-y-2">
        <legend className="sr-only">Zeitpunkt</legend>
        <label className={cn("flex cursor-pointer items-start gap-3 border px-4 py-3 rounded-2xl", mode === "now" ? "border-moss bg-moss-soft/60" : "border-line")}>
          <input type="radio" name="when" checked={mode === "now"} onChange={() => setMode("now")} className="mt-1 accent-[#B64B3A]" />
          <span><span className="block font-semibold">Jetzt veröffentlichen</span><span className="text-sm text-muted">Sofort sichtbar.</span></span>
        </label>
        {canSchedule && (
          <label className={cn("flex cursor-pointer items-start gap-3 border px-4 py-3 rounded-2xl", mode === "later" ? "border-moss bg-moss-soft/60" : "border-line")}>
            <input type="radio" name="when" checked={mode === "later"} onChange={() => setMode("later")} className="mt-1 accent-[#B64B3A]" />
            <span className="flex-1">
              <span className="flex items-center gap-1.5 font-semibold"><CalendarClock size={15} /> Planen</span>
              <span className="text-sm text-muted">Automatisch zum gewählten Zeitpunkt.</span>
              {mode === "later" && (
                <input type="datetime-local" value={when} min={minLocal} onChange={(e) => setWhen(e.target.value)} aria-label="Veröffentlichungszeitpunkt" className="mt-2 h-10 w-full border border-line-strong bg-card px-2 font-mono text-sm outline-none focus:border-moss rounded-2xl" />
              )}
            </span>
          </label>
        )}
      </fieldset>
      <Checkbox className="mt-4" label="Im Feed ankündigen (Beitrag mit Vorspann und Link)" checked={share} onChange={(e) => setShare(e.target.checked)} />
      <Button
        className="mt-5 w-full"
        disabled={!valid || pending}
        onClick={() =>
          start(async () => {
            const ok = await onConfirm({ shareToFeed: share, ...(mode === "later" && when ? { publishAt: new Date(when).toISOString() } : {}) });
            if (ok) onClose();
          })
        }
      >
        {pending ? "Wird veröffentlicht …" : mode === "later" ? "Planen" : "Jetzt veröffentlichen"}
      </Button>
    </Dialog>
  );
}
