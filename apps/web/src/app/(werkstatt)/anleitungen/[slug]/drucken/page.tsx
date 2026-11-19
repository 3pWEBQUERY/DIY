import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { DIFFICULTY_LABEL, SAFETY_LABEL, categoryBySlug, formatMoney, materialsCostEstimate } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getTutorialPage } from "@/server/tutorials/service";
import { absUrl } from "@/components/projects/json-ld";
import { PrintButton } from "@/components/pro/print-button";
import { BRAND } from "@/config/brand";
import { formatDate, formatMinutes, pad } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ bilder?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const user = await currentUser();
  const t = await getTutorialPage(slug, user?.id ?? null);
  return { title: t ? `${t.title} – Druckfassung` : "Anleitung nicht gefunden", robots: { index: false, follow: false } };
}

/**
 * Druckfassung einer Anleitung (A4, als PDF sicherbar): Datenblatt, Material zum Abhaken,
 * Werkzeug, alle Schritte mit Bildern, Tipps und Sicherheitshinweisen, Notizzeilen und ein
 * QR-Code zur Online-Fassung. Gleiche Sichtbarkeit wie die Anleitung selbst.
 */
export default async function TutorialPrintPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bilder } = await searchParams;
  const withImages = bilder !== "0";
  const user = await currentUser();
  const t = await getTutorialPage(slug, user?.id ?? null);
  if (!t) notFound();

  const cat = categoryBySlug(t.category);
  const stepsMinutes = t.steps.reduce((a, s) => a + (s.minutes ?? 0), 0);
  const url = absUrl(t.href) ?? t.href;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#262427", light: "#00000000" } });
  const cost = materialsCostEstimate(t.materials);
  const facts = [
    { label: "Schwierigkeit", value: DIFFICULTY_LABEL[t.difficulty] },
    { label: "Dauer", value: formatMinutes(t.minutes ?? (stepsMinutes || null)) },
    { label: "Schritte", value: String(t.steps.length) },
    ...(cost ? [{ label: "Material ca.", value: `${cost.complete ? "" : "ab "}${formatMoney(cost.totalMinor)}` }] : []),
    { label: "Version", value: t.preview ? "Entwurf" : `v${t.version.number} · ${formatDate(t.version.publishedAt, { day: "numeric", month: "short", year: "numeric" })}` },
  ];

  return (
    <div className="mx-auto max-w-[820px] px-4 py-6 sm:px-8 print:max-w-none print:p-0">
      {/* Werkzeugleiste (nur am Bildschirm) */}
      <div className="mb-8 flex flex-wrap items-center gap-3 border-b border-line pb-4 print:hidden">
        <Link href={t.href} className="mr-auto inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
          <ArrowLeft size={14} aria-hidden /> Zur Anleitung
        </Link>
        <Link
          href={`${t.href}/drucken${withImages ? "?bilder=0" : ""}`}
          className="text-[13px] font-semibold text-ink-2 underline-offset-2 hover:underline"
          replace
        >
          {withImages ? "Ohne Bilder (spart Tinte)" : "Mit Bildern"}
        </Link>
        <PrintButton label="Drucken oder als PDF sichern" />
      </div>
      <p className="mb-6 text-[13px] text-muted print:hidden">
        Tipp: Im Druckdialog „Als PDF sichern“ wählen. Hintergrundgrafiken einschalten, damit Hinweise farbig erscheinen.
      </p>

      <article className="print-doc text-ink">
        {/* Kopf */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 border-b-2 border-ink pb-5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {BRAND.name} · Anleitung{cat ? ` · ${cat.name}` : ""}
            </p>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-balance">{t.title}</h1>
            {t.summary && <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{t.summary}</p>}
            <p className="mt-3 text-[12.5px] text-muted">von {t.author.displayName} (@{t.author.handle})</p>
          </div>
          <div className="w-[92px] text-center">
            <div className="size-[92px] [&_svg]:size-full" aria-label={`QR-Code zur Online-Fassung: ${url}`} role="img" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-1 text-[9px] leading-tight text-muted">Online mit Videos und Fragen</p>
          </div>
        </header>

        <dl className={`mt-4 grid border border-line text-[12.5px] ${cost ? "grid-cols-5" : "grid-cols-4"}`}>
          {facts.map((f) => (
            <div key={f.label} className="border-r border-line px-3 py-2 last:border-r-0">
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">{f.label}</dt>
              <dd className="mt-0.5 font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>

        {withImages && t.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.coverUrl} alt="" className="mt-5 max-h-[300px] w-full rounded-lg border border-line object-cover" />
        )}

        {t.safetyKinds.length > 0 && (
          <div className="mt-5 break-inside-avoid border-l-[3px] border-danger bg-danger-soft px-4 py-2.5 text-[12.5px]">
            <b className="font-mono text-[10px] uppercase tracking-[0.1em] text-danger">Sicherheit · </b>
            Diese Anleitung enthält Arbeiten mit {t.safetyKinds.map((k) => SAFETY_LABEL[k]).join(", ")}. Hinweise stehen beim jeweiligen Schritt. Beachte immer die Angaben der Hersteller.
          </div>
        )}

        {(t.materials.length > 0 || t.tools.length > 0) && (
          <section className="mt-7 grid grid-cols-2 gap-8 break-inside-avoid">
            {t.materials.length > 0 && (
              <div>
                <h2 className="border-b border-ink pb-1 text-[14px] font-extrabold">Material · {t.materials.length}</h2>
                <ul className="text-[12.5px]">
                  {t.materials.map((m, i) => (
                    <li key={`${m.name}-${i}`} className="flex items-baseline gap-2.5 border-b border-line py-1.5">
                      <span aria-hidden className="inline-block size-3 shrink-0 translate-y-[1px] border border-ink" />
                      <span className="min-w-0 flex-1">
                        <b className="font-semibold">{m.name}</b>
                        {m.note && <span className="text-muted"> · {m.note}</span>}
                      </span>
                      <span className="shrink-0 text-right tabular-nums text-ink-2">
                        {m.quantity}
                        {m.costMinor != null && <span className="ml-2 text-muted">{formatMoney(m.costMinor)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {t.tools.length > 0 && (
              <div>
                <h2 className="border-b border-ink pb-1 text-[14px] font-extrabold">Werkzeug · {t.tools.length}</h2>
                <ul className="text-[12.5px]">
                  {t.tools.map((x, i) => (
                    <li key={`${x.name}-${i}`} className="flex items-baseline gap-2.5 border-b border-line py-1.5">
                      <span aria-hidden className="inline-block size-3 shrink-0 translate-y-[1px] border border-ink" />
                      <span className="min-w-0 flex-1">
                        <b className="font-semibold">{x.name}</b>
                        {(x.quantity || x.note) && <span className="text-muted"> · {[x.quantity, x.note].filter(Boolean).join(" · ")}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section className="mt-8">
          <h2 className="border-b-2 border-ink pb-1 text-[16px] font-extrabold">Schritt für Schritt</h2>
          <ol>
            {t.steps.map((s) => (
              <li key={s.stableKey} className="border-b border-line py-4 [break-inside:avoid-page]">
                <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-3">
                  <span className="text-[28px] font-extrabold leading-none tabular-nums">{pad(s.position + 1)}</span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold leading-snug">
                      {s.title}
                      {s.minutes ? <span className="ml-2 font-mono text-[10.5px] font-normal text-muted">ca. {formatMinutes(s.minutes)}</span> : null}
                    </h3>
                    {s.safety && (
                      <p className="mt-2 border-l-[3px] border-danger bg-danger-soft px-3 py-1.5 text-[12px] leading-relaxed">
                        <b className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-danger">
                          Sicherheit{s.safetyKinds.length ? ` · ${s.safetyKinds.map((k) => SAFETY_LABEL[k]).join(", ")}` : ""} ·{" "}
                        </b>
                        <span className="whitespace-pre-line">{s.safety}</span>
                      </p>
                    )}
                    {s.body && <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed">{s.body}</p>}
                    {s.tip && (
                      <p className="mt-2 border-l-[3px] border-moss bg-moss-soft px-3 py-1.5 text-[12px] leading-relaxed">
                        <b className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-moss-ink">Tipp · </b>
                        <span className="whitespace-pre-line">{s.tip}</span>
                      </p>
                    )}
                    {(s.materials.length > 0 || s.tools.length > 0) && (
                      <p className="mt-2 text-[11.5px] text-muted">
                        {s.materials.length > 0 && <>Material: {s.materials.join(", ")}</>}
                        {s.materials.length > 0 && s.tools.length > 0 && " · "}
                        {s.tools.length > 0 && <>Werkzeug: {s.tools.join(", ")}</>}
                      </p>
                    )}
                    {withImages && s.media.length > 0 && (
                      <div className={`mt-3 grid gap-2 ${s.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {s.media.slice(0, 4).map((m, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={m.mediaId} src={m.url!} alt={m.alt || `Schritt ${s.position + 1}, Bild ${i + 1}`} className={`w-full rounded border border-line object-cover ${s.media.length > 1 ? "max-h-[180px]" : "max-h-[260px]"}`} />
                        ))}
                      </div>
                    )}
                    <div aria-hidden className="mt-3 flex items-center gap-2 text-[10.5px] text-muted">
                      <span className="inline-block size-3 border border-ink" /> erledigt
                      <span className="ml-3 h-px flex-1 border-b border-dotted border-line-strong" />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-6 break-inside-avoid">
          <h2 className="text-[13px] font-extrabold">Notizen</h2>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-7 border-b border-line" />
          ))}
        </section>

        <footer className="mt-8 border-t border-line pt-3 text-[10px] leading-relaxed text-muted">
          {BRAND.name} · {url} · Gedruckt am {formatDate(new Date().toISOString(), { day: "numeric", month: "long", year: "numeric" })}. Tipps geben persönliche Erfahrungen wieder;
          Sicherheitshinweise ersetzen keine Herstellerangaben oder Fachberatung. Diese Anleitung ist urheberrechtlich geschützt und nur für den
          persönlichen Gebrauch bestimmt.
        </footer>
      </article>
    </div>
  );
}
