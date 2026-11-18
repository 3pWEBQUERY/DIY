"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ImagePlus, Loader2, RefreshCw, Type } from "lucide-react";
import {
  STORY_AUDIENCES,
  STORY_AUDIENCE_LABEL,
  STORY_BACKGROUNDS,
  STORY_BACKGROUND_KEYS,
  STORY_CAPTION_MAX,
  STORY_TEXT_MAX,
  STORY_VIDEO_MAX_SECONDS,
  type StoryAudience,
  type StoryBackground,
} from "@werkraum/shared";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { uploadFile } from "@/components/media/uploader";
import { createStoryAction } from "@/app/(app)/stories/actions";
import { callAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { StoryMedia, StoryText } from "./story-content";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/avif,video/mp4,video/quicktime,video/webm";

type Upload =
  | { status: "idle" }
  | { status: "uploading" | "ready"; kind: "IMAGE" | "VIDEO"; preview: string; progress: number; mediaId?: string; processing?: boolean; width?: number | null; height?: number | null }
  | { status: "error"; message: string };

function videoSeconds(file: File) {
  return new Promise<number | null>((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 5000);
    v.src = url;
  });
}

/**
 * Story erstellen: Foto/Video mit optionaler Bildunterschrift oder eine Text-Story auf einer
 * Farbfläche. Links die Vorschau im Story-Format (9:16), rechts die Angaben.
 */
export function StoryComposer({
  open,
  onClose,
  projects = [],
}: {
  open: boolean;
  onClose: () => void;
  projects?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"MEDIA" | "TEXT">("MEDIA");
  const [upload, setUpload] = useState<Upload>({ status: "idle" });
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [text, setText] = useState("");
  const [background, setBackground] = useState<StoryBackground>("coral");
  const [visibility, setVisibility] = useState<StoryAudience>("PUBLIC");
  const [projectId, setProjectId] = useState("");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const uploadSeq = useRef(0);
  /** Aktuelle Vorschau-URL (Object URL) – beim Ersetzen, Zurücksetzen und Aushängen freigeben */
  const previewUrl = useRef<string | null>(null);
  function setPreviewUrl(url: string | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = url;
  }
  useEffect(() => () => setPreviewUrl(null), []);

  useEffect(() => {
    if (open && mode === "TEXT") textRef.current?.focus();
  }, [open, mode]);

  function reset() {
    uploadSeq.current++;
    setMode("MEDIA");
    setUpload({ status: "idle" });
    setPreviewUrl(null);
    setAlt("");
    setCaption("");
    setText("");
    setBackground("coral");
    setVisibility("PUBLIC");
    setProjectId("");
  }

  function close() {
    if (pending) return;
    reset();
    onClose();
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    const kind = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
    if (kind === "VIDEO") {
      const sec = await videoSeconds(file);
      if (sec && sec > STORY_VIDEO_MAX_SECONDS + 1) {
        setUpload({ status: "error", message: `Das Video ist ${Math.round(sec)} Sekunden lang. Story-Videos dürfen höchstens ${STORY_VIDEO_MAX_SECONDS} Sekunden lang sein – längere Videos teilst du als Beitrag.` });
        return;
      }
    }
    const seq = ++uploadSeq.current;
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setUpload({ status: "uploading", kind, preview, progress: 0 });
    try {
      const r = await uploadFile(file, "public", (p) => seq === uploadSeq.current && setUpload((u) => (u.status === "uploading" ? { ...u, progress: p } : u)));
      if (seq !== uploadSeq.current) return;
      const done = r as { mediaId: string; state: string; variants: Record<string, string>; width?: number | null; height?: number | null };
      setUpload({ status: "ready", kind, preview, progress: 1, mediaId: done.mediaId, processing: done.state !== "READY", width: done.width, height: done.height });
    } catch (e) {
      if (seq !== uploadSeq.current) return;
      setPreviewUrl(null);
      setUpload({ status: "error", message: e instanceof Error ? e.message : "Upload fehlgeschlagen. Bitte versuche es erneut." });
    }
  }

  const ready = mode === "MEDIA" ? upload.status === "ready" && !!upload.mediaId : text.trim().length > 0;

  function submit() {
    if (!ready || pending) return;
    start(async () => {
      const r = await callAction(() =>
        createStoryAction(
          mode === "MEDIA" && upload.status === "ready"
            ? { kind: "MEDIA", media: { id: upload.mediaId, alt }, text: caption, visibility, projectId: projectId || undefined }
            : { kind: "TEXT", text, background, visibility, projectId: projectId || undefined },
        ),
      );
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      toast(mode === "MEDIA" && upload.status === "ready" && upload.processing ? "Deine Story erscheint, sobald das Video verarbeitet ist." : (r.message ?? "Story geteilt."));
      reset();
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={close} title="Neue Story" description="Sichtbar für 24 Stunden – danach in deinem Archiv." wide>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        {/* Vorschau im Story-Format */}
        <div className="mx-auto w-full max-w-[15rem]">
          <div className="@container relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-line bg-sunken">
            {mode === "TEXT" ? (
              <StoryText text={text} background={background} placeholder="Dein Text" />
            ) : upload.status === "uploading" || upload.status === "ready" ? (
              <>
                <StoryMedia media={{ kind: upload.kind, image: upload.kind === "IMAGE" ? upload.preview : null, video: upload.kind === "VIDEO" ? upload.preview : null, poster: null, width: upload.status === "ready" ? (upload.width ?? null) : null, height: upload.status === "ready" ? (upload.height ?? null) : null, dominant: "#151312" }} alt={alt} muted />
                {caption && (
                  <p className="absolute inset-x-3 bottom-3 rounded-xl bg-black/55 px-3 py-2 text-center text-[12px] leading-snug text-white">{caption}</p>
                )}
                {upload.status === "uploading" && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={22} className="animate-spin" aria-hidden />
                      <span className="text-[12px] font-semibold num">{Math.round(upload.progress * 100)} %</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void pick(e.dataTransfer.files[0]);
                }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-muted transition-colors hover:text-ink"
              >
                <span className="grid size-12 place-items-center rounded-full bg-card text-moss border border-line">
                  <ImagePlus size={20} aria-hidden />
                </span>
                <span className="text-sm font-semibold text-ink">Foto oder Video wählen</span>
                <span className="text-[12px] leading-relaxed">Hochformat wirkt am besten. Videos bis {STORY_VIDEO_MAX_SECONDS} Sekunden.</span>
              </button>
            )}
          </div>
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        {/* Angaben */}
        <div className="min-w-0 space-y-5">
          <div role="radiogroup" aria-label="Art der Story" className="inline-flex rounded-xl border border-line bg-sunken p-1">
            {([
              { key: "MEDIA", label: "Foto/Video", icon: <ImagePlus size={15} aria-hidden /> },
              { key: "TEXT", label: "Text", icon: <Type size={15} aria-hidden /> },
            ] as const).map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={mode === m.key}
                onClick={() => setMode(m.key)}
                className={cn("inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition-colors", mode === m.key ? "bg-card text-ink border border-line" : "text-muted hover:text-ink border border-transparent")}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>

          {mode === "MEDIA" ? (
            <>
              {upload.status === "error" && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {upload.message}
                </p>
              )}
              {upload.status === "ready" && upload.processing && (
                <p className="rounded-xl bg-sunken px-3 py-2.5 text-[13px] text-ink-2">Das Video wird im Hintergrund aufbereitet. Du kannst die Story schon teilen – sie erscheint, sobald es fertig ist.</p>
              )}
              {(upload.status === "ready" || upload.status === "uploading") && (
                <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-2 text-[13px] font-semibold text-moss hover:underline">
                  <RefreshCw size={14} aria-hidden /> Andere Datei wählen
                </button>
              )}
              {upload.status !== "ready" && upload.status !== "uploading" && (
                <Button variant="outline" onClick={() => input.current?.click()} className="w-full sm:w-auto">
                  <ImagePlus size={16} aria-hidden /> Datei auswählen
                </Button>
              )}
              <label className="block">
                <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold">
                  Bildunterschrift <span className="font-normal text-muted num">{caption.length}/{STORY_CAPTION_MAX}</span>
                </span>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, STORY_CAPTION_MAX))}
                  rows={2}
                  placeholder="Optional – ein Satz zum Bild"
                  className="block w-full resize-none rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[15px] outline-none placeholder:text-muted focus:border-ink"
                />
              </label>
              {upload.status === "ready" && upload.kind === "IMAGE" && (
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold">Bildbeschreibung</span>
                  <input
                    value={alt}
                    onChange={(e) => setAlt(e.target.value.slice(0, 500))}
                    placeholder="Was ist zu sehen? (für Screenreader)"
                    className="h-11 w-full rounded-xl border border-line-strong bg-card px-3.5 text-[15px] outline-none placeholder:text-muted focus:border-ink"
                  />
                </label>
              )}
            </>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold">
                  Text <span className="font-normal text-muted num">{text.length}/{STORY_TEXT_MAX}</span>
                </span>
                <textarea
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, STORY_TEXT_MAX))}
                  rows={4}
                  placeholder="Was beschäftigt dich gerade an der Werkbank?"
                  className="block w-full resize-none rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[15px] outline-none placeholder:text-muted focus:border-ink"
                />
              </label>
              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold">Hintergrund</legend>
                <div className="flex flex-wrap gap-2.5">
                  {STORY_BACKGROUND_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setBackground(k)}
                      aria-pressed={background === k}
                      aria-label={STORY_BACKGROUNDS[k].label}
                      title={STORY_BACKGROUNDS[k].label}
                      className={cn("grid size-9 place-items-center rounded-full border-2 transition-colors", background === k ? "border-ink" : "border-transparent hover:border-line-strong")}
                    >
                      <span className="size-6 rounded-full border border-black/10" style={{ background: STORY_BACKGROUNDS[k].bg }} />
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[13px] font-semibold">
              <span className="mb-1.5 block">Wer sieht die Story?</span>
              <Select value={visibility} onChange={(e) => setVisibility(e.target.value as StoryAudience)} aria-label="Wer sieht die Story?" className="h-10 text-sm">
                {STORY_AUDIENCES.map((a) => (
                  <option key={a} value={a}>{STORY_AUDIENCE_LABEL[a]}</option>
                ))}
              </Select>
            </label>
            {projects.length > 0 && (
              <label className="block text-[13px] font-semibold">
                <span className="mb-1.5 block">Projektfaden</span>
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Projektfaden" className="h-10 text-sm">
                  <option value="">Kein Projekt</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </Select>
              </label>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close} disabled={pending}>Abbrechen</Button>
            <Button onClick={submit} disabled={!ready || pending}>
              {pending && <Loader2 size={16} className="animate-spin" aria-hidden />} Story teilen
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
