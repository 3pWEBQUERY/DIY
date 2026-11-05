"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { CATEGORIES, PROFILE_COUNTRIES, PROFILE_COUNTRY_LABEL, listCategories } from "@werkraum/shared";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/components/media/uploader";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Glyph } from "@/components/ui/glyphs";
import { toast } from "@/components/ui/toast";
import { SettingsSection } from "./section";
import { checkHandleAction, updateProfileAction } from "@/app/(app)/einstellungen/actions";

type Profile = {
  displayName: string;
  handle: string;
  bio: string;
  region: string | null;
  country: string | null;
  website: string | null;
  pronouns: string | null;
  links: { label: string; url: string }[];
  categories: string[];
  avatarUrl: string | null;
  coverUrl: string | null;
};

type Img = { mediaId: string | null; url: string | null; busy: boolean; removed: boolean };

function useImageUpload(initial: string | null, variant: "md" | "lg") {
  const [img, setImg] = useState<Img>({ mediaId: null, url: initial, busy: false, removed: false });
  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Bitte wähle ein Bild (JPG, PNG, WebP, HEIC).", "error");
    setImg((s) => ({ ...s, busy: true }));
    try {
      const r = await uploadFile(file, "public");
      const url = r.variants?.[variant] ?? r.variants?.lg ?? r.variants?.md;
      if (r.state !== "READY" || !url) throw new Error("Das Bild wird noch verarbeitet. Bitte versuche es in einem Moment erneut.");
      setImg({ mediaId: r.mediaId, url, busy: false, removed: false });
    } catch (e) {
      setImg((s) => ({ ...s, busy: false }));
      toast(e instanceof Error ? e.message : "Upload fehlgeschlagen", "error");
    }
  }
  return { img, pick, remove: () => setImg({ mediaId: null, url: null, busy: false, removed: true }) };
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const avatar = useImageUpload(profile.avatarUrl, "md");
  const cover = useImageUpload(profile.coverUrl, "lg");
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [handleState, setHandleState] = useState<{ status: "idle" | "checking" | "ok" | "error"; reason?: string }>({ status: "idle" });
  const [bio, setBio] = useState(profile.bio);
  const [links, setLinks] = useState(profile.links.length ? profile.links : []);
  const [cats, setCats] = useState<string[]>(profile.categories);
  const { run, pending, fields } = useAction(updateProfileAction, {
    success: (d) => (d.handleChanged ? `Gespeichert. Dein Profil ist jetzt unter @${d.handle} erreichbar – der alte Link leitet weiter.` : "Profil gespeichert."),
  });

  useEffect(() => {
    const h = handle.trim().toLowerCase();
    if (h === profile.handle) return setHandleState({ status: "idle" });
    if (h.length < 3) return setHandleState({ status: "error", reason: "Mindestens 3 Zeichen" });
    setHandleState({ status: "checking" });
    const t = setTimeout(async () => {
      const r = await checkHandleAction(h);
      if (!r.ok) return setHandleState({ status: "error", reason: r.error });
      setHandleState(r.data.ok ? { status: "ok" } : { status: "error", reason: r.data.reason });
    }, 350);
    return () => clearTimeout(t);
  }, [handle, profile.handle]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run({
          displayName,
          handle: handle.trim().toLowerCase(),
          bio,
          pronouns: String(fd.get("pronouns") ?? ""),
          region: String(fd.get("region") ?? ""),
          country: String(fd.get("country") ?? "CH"),
          website: String(fd.get("website") ?? ""),
          links: links.filter((l) => l.label.trim() || l.url.trim()),
          categories: cats,
          avatarMediaId: avatar.img.mediaId,
          coverMediaId: cover.img.mediaId,
          removeAvatar: avatar.img.removed,
          removeCover: cover.img.removed,
        });
      }}
    >
      <SettingsSection n="01" title="Bild & Titelbild" description="Ein Foto von dir oder deiner Werkbank. Das Titelbild erscheint oben auf deinem Profil (Querformat, mind. 1600 px breit).">
        <div className="relative border border-line rounded-2xl">
          <div className="relative aspect-[3/1] overflow-hidden rounded-t-2xl bg-sunken sm:aspect-[4/1]">
            {cover.img.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.img.url} alt="Titelbild" className="h-full w-full object-cover" />
            ) : (
              <div className="grid-paper grid h-full place-items-center text-xs text-muted">Kein Titelbild</div>
            )}
            {cover.img.busy && <Loader2 className="absolute right-3 top-3 animate-spin text-ink" size={18} aria-label="Wird hochgeladen" />}
          </div>
          <div className="flex flex-wrap items-end gap-4 px-4 pb-4">
            <div className="relative -mt-10 rounded-full border-4 border-paper bg-paper">
              <Avatar src={avatar.img.url} name={displayName || profile.displayName} size={88} />
              {avatar.img.busy && <Loader2 className="absolute inset-0 m-auto animate-spin text-paper" size={20} aria-label="Wird hochgeladen" />}
            </div>
            <div className="flex flex-wrap gap-2 pt-3">
              <Button size="sm" variant="outline" onClick={() => avatarInput.current?.click()} disabled={avatar.img.busy}>
                <ImagePlus size={14} aria-hidden /> Profilbild
              </Button>
              {avatar.img.url && (
                <Button size="sm" variant="ghost" onClick={avatar.remove} aria-label="Profilbild entfernen">
                  <Trash2 size={14} aria-hidden />
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => coverInput.current?.click()} disabled={cover.img.busy}>
                <ImagePlus size={14} aria-hidden /> Titelbild
              </Button>
              {cover.img.url && (
                <Button size="sm" variant="ghost" onClick={cover.remove} aria-label="Titelbild entfernen">
                  <Trash2 size={14} aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </div>
        <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/avif" hidden onChange={(e) => avatar.pick(e.target.files?.[0])} />
        <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/avif" hidden onChange={(e) => cover.pick(e.target.files?.[0])} />
        <p className="mt-2 text-xs text-muted">Standortdaten (EXIF) werden beim Hochladen automatisch entfernt.</p>
      </SettingsSection>

      <SettingsSection n="02" title="Name & Handle">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Anzeigename" error={fields.displayName}>
            {(p) => <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={60} autoComplete="name" {...p} />}
          </Field>
          <Field
            label="Handle"
            error={fields.handle ?? (handleState.status === "error" ? handleState.reason : undefined)}
            hint={handleState.status === "ok" ? "Verfügbar. Dein alter Profillink leitet automatisch weiter." : "Kleinbuchstaben, Ziffern, Punkt und Unterstrich."}
          >
            {(p) => (
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">@</span>
                <Input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} required minLength={3} maxLength={24} autoCapitalize="off" spellCheck={false} className="pl-7 pr-9" {...p} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
                  {handleState.status === "checking" && <Loader2 size={15} className="animate-spin text-muted" />}
                  {handleState.status === "ok" && <Check size={15} className="text-moss" />}
                  {handleState.status === "error" && <X size={15} className="text-danger" />}
                </span>
              </div>
            )}
          </Field>
          <Field label="Pronomen" optional error={fields.pronouns}>
            {(p) => <Input name="pronouns" defaultValue={profile.pronouns ?? ""} maxLength={30} placeholder="z.B. sie/ihr" {...p} />}
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection n="03" title="Über dich">
        <div className="space-y-5">
          <Field label="Bio" optional hint={`${bio.length}/500 · Was machst du, womit arbeitest du am liebsten?`} error={fields.bio}>
            {(p) => <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={500} {...p} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Region" optional hint="z.B. Basel, Zürcher Oberland" error={fields.region}>
              {(p) => <Input name="region" defaultValue={profile.region ?? ""} maxLength={80} autoComplete="address-level2" {...p} />}
            </Field>
            <Field label="Land" error={fields.country}>
              {(p) => (
                <Select name="country" defaultValue={profile.country ?? "CH"} {...p}>
                  {PROFILE_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {PROFILE_COUNTRY_LABEL[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Website" optional error={fields.website}>
            {(p) => <Input name="website" type="text" inputMode="url" defaultValue={profile.website ?? ""} placeholder="https://" maxLength={300} {...p} />}
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold">
              Weitere Links <span className="font-normal text-muted">optional · max. 6</span>
            </legend>
            <ul className="space-y-2">
              {links.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <Input
                    aria-label={`Bezeichnung Link ${i + 1}`}
                    value={l.label}
                    onChange={(e) => setLinks((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="Instagram"
                    maxLength={40}
                    className="w-36 shrink-0"
                    aria-invalid={fields[`links.${i}.label`] ? true : undefined}
                  />
                  <Input
                    aria-label={`Adresse Link ${i + 1}`}
                    value={l.url}
                    onChange={(e) => setLinks((p) => p.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                    placeholder="https://"
                    inputMode="url"
                    maxLength={300}
                    aria-invalid={fields[`links.${i}.url`] ? true : undefined}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setLinks((p) => p.filter((_, j) => j !== i))} aria-label={`Link ${i + 1} entfernen`}>
                    <X size={16} />
                  </Button>
                </li>
              ))}
            </ul>
            {Object.entries(fields).filter(([k]) => k.startsWith("links")).slice(0, 1).map(([k, v]) => (
              <p key={k} className="mt-1.5 text-[13px] text-danger" role="alert">{v}</p>
            ))}
            {links.length < 6 && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setLinks((p) => [...p, { label: "", url: "" }])}>
                <Plus size={14} aria-hidden /> Link hinzufügen
              </Button>
            )}
          </fieldset>
        </div>
      </SettingsSection>

      <SettingsSection n="04" title="Kreative Schwerpunkte" description="Erscheinen auf deinem Profil und steuern deinen Feed „Für dich“. Änderungen hier gelten auch unter Feed & Interessen.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Kategorien">
          {listCategories().filter((c) => c.isActive || cats.includes(c.slug)).map((c) => {
            const on = cats.includes(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={on}
                onClick={() => setCats((p) => (on ? p.filter((x) => x !== c.slug) : [...p, c.slug]))}
                className={cn("flex items-center gap-2.5 border px-3 py-2.5 text-left text-[13.5px] transition-colors rounded-2xl", on ? "border-moss bg-moss text-paper" : "border-line-strong bg-card hover:border-rule-strong")}
              >
                <Glyph name={c.glyph} size={18} />
                <span className="min-w-0 truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <div className="sticky bottom-[4.75rem] z-10 flex items-center justify-end gap-3 rounded-2xl border border-line bg-card/95 px-4 py-3 shadow-float backdrop-blur md:bottom-4">
        <Button type="submit" variant="ink" disabled={pending || avatar.img.busy || cover.img.busy || handleState.status === "checking" || handleState.status === "error"} aria-busy={pending}>
          {pending ? "Speichert …" : "Profil speichern"}
        </Button>
      </div>
    </form>
  );
}
