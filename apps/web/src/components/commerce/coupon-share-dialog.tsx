"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Download, Megaphone, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { ShareSheet } from "@/components/social/share-sheet";
import { uploadFile } from "@/components/media/uploader";
import { callAction } from "@/lib/use-action";
import { createPostAction } from "@/app/(app)/social-actions";
import { BRAND } from "@/config/brand";

export type ShareCoupon = { id: string; code: string; valueLabel: string; shopName: string; minLabel: string | null; endsAt: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" });

/** Vorgeschlagener Beitragstext – frei änderbar, bevor geteilt wird. */
export function couponCaption(c: ShareCoupon, url: string) {
  const cond = [c.minLabel, c.endsAt ? `gültig bis ${day(c.endsAt)}` : null].filter(Boolean).join(", ");
  return `Gutschein für ${c.shopName}: Mit dem Code ${c.code} bekommst du ${c.valueLabel} Rabatt auf deinen Einkauf${cond ? ` (${cond})` : ""}.\n\nEinfach im Warenkorb eingeben: ${url}\n\n#${BRAND.name.toLowerCase()} #diy #handgemacht`;
}

/**
 * Gutschein teilen: fertiges Bild (Werkuno-Vorlage mit Code) und Beitragstext.
 * – Handy: Bild und Text direkt an Instagram, WhatsApp, Facebook … (System-Teilen mit Datei)
 * – Überall: Bild herunterladen, Text kopieren, Link auf allen Plattformen teilen
 * – Als Beitrag im Werkuno-Feed veröffentlichen
 */
export function CouponShareDialog({ coupon, onClose }: { coupon: ShareCoupon; onClose: () => void }) {
  const imagePath = `/gutschein/${coupon.id}/bild`;
  const pagePath = `/gutschein/${coupon.id}`;
  const [origin, setOrigin] = useState("");
  const url = `${origin}${pagePath}`;
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [canShareFile, setCanShareFile] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(location.origin);
    setText(couponCaption(coupon, `${location.origin}${pagePath}`));
  }, [coupon, pagePath]);

  // Bild einmal laden – für System-Teilen, Download und Feed-Beitrag
  useEffect(() => {
    let alive = true;
    fetch(imagePath)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (!alive) return;
        const f = new File([b], `gutschein-${coupon.code.toLowerCase()}.png`, { type: "image/png" });
        setFile(f);
        setCanShareFile(typeof navigator.canShare === "function" && navigator.canShare({ files: [f] }));
      })
      .catch(() => alive && toast("Das Bild konnte nicht erstellt werden. Ist der Gutschein aktiv?", "error"));
    return () => {
      alive = false;
    };
  }, [imagePath, coupon.code]);

  const copyText = async (silent = false) => {
    try {
      await navigator.clipboard.writeText(text);
      if (!silent) toast("Text kopiert.");
      return true;
    } catch {
      if (!silent) toast("Kopieren nicht möglich – markiere den Text und kopiere ihn manuell.", "error");
      return false;
    }
  };

  const download = async () => {
    if (!file) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast((await copyText(true)) ? "Bild gespeichert, Text kopiert – jetzt in der App einfügen." : "Bild gespeichert.");
  };

  const shareNative = async () => {
    if (!file) return;
    // Manche Apps (z. B. Instagram) übernehmen nur das Bild – Text vorsorglich in die Zwischenablage
    await copyText(true);
    try {
      await navigator.share({ files: [file], text, title: `Gutschein ${coupon.code}` });
    } catch {
      /* abgebrochen */
    }
  };

  const postToFeed = async () => {
    if (!file || posting) return;
    setPosting(true);
    try {
      const up = await uploadFile(file, "public");
      const r = await callAction(() => createPostAction({ body: text, media: [{ id: up.mediaId, alt: `Gutschein ${coupon.code}: ${coupon.valueLabel} Rabatt bei ${coupon.shopName}` }] }));
      if (r.ok) {
        setPostId(r.data.id);
        toast("Beitrag veröffentlicht.");
      } else toast(r.error, "error");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload nicht möglich.", "error");
    } finally {
      setPosting(false);
    }
  };

  const title = useMemo(() => `${coupon.valueLabel} Rabatt bei ${coupon.shopName}`, [coupon]);

  return (
    <>
      <Dialog open onClose={onClose} wide title={`Gutschein ${coupon.code} teilen`} description="Bild und Text sind fertig – du kannst den Text noch anpassen.">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePath} alt={`Gutschein ${coupon.code}`} width={1080} height={1080} className="aspect-square w-full rounded-xl border border-line bg-sunken" />
            <p className="mt-2 text-[12px] text-muted">1080 × 1080 px – passt für Feed-Beiträge auf Instagram, Facebook und LinkedIn.</p>
          </div>
          <div className="flex min-w-0 flex-col">
            <label htmlFor="coupon-caption" className="mb-1.5 text-[13px] font-semibold">
              Beitragstext
            </label>
            <Textarea id="coupon-caption" value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={2000} className="text-[14px]" />

            <div className="mt-4 grid gap-2">
              {canShareFile && (
                <Button onClick={shareNative} disabled={!file}>
                  <Share2 size={15} /> Bild und Text teilen
                </Button>
              )}
              <Button variant={canShareFile ? "outline" : "primary"} onClick={() => setSheet(true)} disabled={!origin}>
                <Share2 size={15} /> Auf Social Media teilen
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={download} disabled={!file}>
                  <Download size={15} /> Bild speichern
                </Button>
                <Button variant="outline" onClick={() => void copyText()}>
                  <Copy size={15} /> Text kopieren
                </Button>
              </div>
              {postId ? (
                <Link href={`/beitrag/${postId}`} className="mt-1 text-center text-[13.5px] font-semibold text-moss underline-offset-2 hover:underline">
                  Beitrag im {BRAND.name}-Feed ansehen →
                </Link>
              ) : (
                <Button variant="ghost" onClick={postToFeed} disabled={!file || posting}>
                  <Megaphone size={15} /> {posting ? "Veröffentliche …" : `Als Beitrag auf ${BRAND.name} posten`}
                </Button>
              )}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              Instagram und TikTok erlauben kein direktes Posten aus dem Browser: Auf dem Handy über „Bild und Text teilen“, am Computer Bild speichern und in der App hochladen – der Text liegt dann schon in der Zwischenablage.
            </p>
          </div>
        </div>
      </Dialog>
      {sheet && <ShareSheet open onClose={() => setSheet(false)} url={url} title={title} text={text.replace(/\n+/g, " ").replace(url, "").trim()} image={imagePath} />}
    </>
  );
}
