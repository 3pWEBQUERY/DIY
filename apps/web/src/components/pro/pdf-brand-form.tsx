"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { uploadFile } from "@/components/media/uploader";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/lib/use-action";
import { clearPdfBrandAction, savePdfBrandAction } from "@/app/studio/einstellungen/actions";

type Brand = { name: string; link: string | null; logoUrl: string | null } | null;

/**
 * PDF-Branding (Creator Pro): Logo, Name und Link erscheinen im Kopf und in der Fusszeile der
 * Druck-/PDF-Fassung deiner Anleitungen. Mit Vorschau des Kopfs.
 */
export function PdfBrandForm({ brand, defaultName, defaultLink, previewHref }: { brand: Brand; defaultName: string; defaultLink: string; previewHref: string | null }) {
  const [name, setName] = useState(brand?.name ?? defaultName);
  const [link, setLink] = useState(brand?.link ?? defaultLink);
  const [logo, setLogo] = useState<{ mediaId: string | null; url: string | null; removed: boolean }>({ mediaId: null, url: brand?.logoUrl ?? null, removed: false });
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const save = useAction(savePdfBrandAction, { refresh: true });
  const clear = useAction(clearPdfBrandAction, { refresh: true });

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Bitte wähle ein Bild (PNG, JPG, WebP, SVG wird nicht unterstützt).", "error");
    setBusy(true);
    try {
      const r = await uploadFile(file, "public");
      const url = r.variants?.md ?? r.variants?.sm ?? r.variants?.lg;
      if (r.state !== "READY" || !url) throw new Error("Das Bild wird noch verarbeitet. Bitte versuche es gleich noch einmal.");
      setLogo({ mediaId: r.mediaId, url, removed: false });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload fehlgeschlagen", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ name, link: link.trim(), ...(logo.mediaId ? { logoMediaId: logo.mediaId } : {}), ...(logo.removed ? { removeLogo: true } : {}) });
      }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-20 place-items-center overflow-hidden rounded-xl border border-line bg-paper">
          {logo.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo.url} alt="Dein Logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[11px] text-muted">Kein Logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            <ImagePlus size={15} aria-hidden /> {busy ? "Lädt hoch …" : logo.url ? "Logo ersetzen" : "Logo hochladen"}
          </Button>
          {logo.url && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLogo({ mediaId: null, url: null, removed: true })}>
              <Trash2 size={15} aria-hidden /> Entfernen
            </Button>
          )}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <Field label="Name im Kopf" error={save.fields.name} hint="z. B. dein Atelier- oder Shopname">
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
      </Field>
      <Field label="Link" optional error={save.fields.link} hint="Shop oder Website, mit https:// – erscheint in der Fusszeile, mit QR-Code">
        {(p) => <Input {...p} type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" maxLength={200} />}
      </Field>

      <div className="rounded-xl border border-line bg-paper p-4" aria-label="Vorschau des Kopfs">
        <p className="spec mb-3">Vorschau</p>
        <div className="flex items-center gap-3 border-b-2 border-ink pb-3">
          {logo.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo.url} alt="" className="h-10 w-auto max-w-[120px] object-contain" />
          )}
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{name || "Dein Name"} · Anleitung</p>
            <p className="text-[18px] font-extrabold leading-tight">Titel deiner Anleitung</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted">
          {name || "Dein Name"}
          {link ? ` · ${link}` : ""} · erstellt mit Werkuno
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={save.pending || busy}>
          {save.pending ? "Speichert …" : "Speichern"}
        </Button>
        {brand && (
          <Button type="button" variant="ghost" onClick={() => clear.run()} disabled={clear.pending}>
            Standard verwenden
          </Button>
        )}
        {previewHref && (
          <a href={previewHref} target="_blank" rel="noreferrer" className="ml-auto text-[13px] font-semibold text-ink-2 underline-offset-2 hover:underline">
            Druckfassung ansehen
          </a>
        )}
      </div>
    </form>
  );
}
