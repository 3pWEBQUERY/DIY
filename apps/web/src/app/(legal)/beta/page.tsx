import Link from "next/link";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { BRAND } from "@/config/brand";
import { LEGAL } from "@/config/legal";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = {
  title: "iPhone-App testen",
  description: `Teste die ${BRAND.name}-App fürs iPhone vor allen anderen – über Apples TestFlight.`,
  alternates: { canonical: "/beta" },
};

export const revalidate = 300;

const TESTFLIGHT_APP = "https://apps.apple.com/app/testflight/id899247664";

const TRY = [
  "Ein Projekt anlegen und einen ersten Journal-Eintrag mit Foto schreiben",
  "Einen Beitrag mit Foto oder Video auf der Werkbank veröffentlichen",
  "Eine Anleitung öffnen, Schritte abhaken und Material auf die Einkaufsliste setzen",
  "Ein Projekt nachbauen und einer Community beitreten",
  "Im Marktplatz stöbern, einem Shop folgen, eine Nachricht schreiben",
];

/** Öffentliche Seite für die iOS-Beta: Anleitung in drei Schritten, Link aus Admin → Systemkonfiguration. */
export default async function BetaPage() {
  const url = (await getSetting("app.testflightUrl")).trim();
  const qr = url ? await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#1f1d1e", light: "#00000000" } }) : null;

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 md:py-14 lg:px-10">
      <header className="mb-10 max-w-3xl">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          iPhone-App · Beta
        </p>
        <h1 className="display text-[2.6rem] text-balance sm:text-6xl">Teste {BRAND.name} auf dem iPhone</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-2 text-pretty">
          Die iPhone-App ist fast fertig. Bevor sie im App Store erscheint, suchen wir Maker, die sie ausprobieren und uns sagen, was gut funktioniert und was noch hakt. Jede Rückmeldung
          liest ein Mensch – und vieles davon landet direkt in der nächsten Version.
        </p>
      </header>

      {!url ? (
        <div className="max-w-3xl rounded-2xl border border-line bg-card p-6">
          <h2 className="headline text-xl">Die Beta startet in Kürze</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Sobald Apple die Testversion freigegeben hat, findest du hier den Einladungslink. Schau bald wieder vorbei – oder schreib uns an{" "}
            <a href={`mailto:${LEGAL.email}?subject=${encodeURIComponent("iPhone-Beta")}`} className="text-moss underline underline-offset-2">{LEGAL.email}</a>, dann melden wir uns.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
            <li className="bg-card p-6">
              <p className="spec text-moss">Schritt 1</p>
              <h2 className="headline mt-1 text-xl">TestFlight installieren</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">TestFlight ist Apples offizielle App für Testversionen. Sie ist kostenlos und braucht kein eigenes Konto.</p>
              <a href={TESTFLIGHT_APP} className="mt-4 inline-flex h-10 items-center rounded-xl border border-line-strong px-4 text-sm font-semibold hover:border-rule-strong">
                TestFlight im App Store
              </a>
            </li>
            <li className="bg-card p-6">
              <p className="spec text-moss">Schritt 2</p>
              <h2 className="headline mt-1 text-xl">Einladung öffnen</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                Öffne den Link auf deinem iPhone, tippe in TestFlight auf „Akzeptieren“ und dann auf „Installieren“. Anschliessend meldest du dich mit deinem {BRAND.name}-Konto an.
              </p>
              <a href={url} className="mt-4 inline-flex h-10 items-center rounded-xl bg-moss px-4 text-sm font-semibold text-paper hover:bg-moss-ink">
                Zur {BRAND.name}-Beta
              </a>
            </li>
            <li className="bg-card p-6">
              <p className="spec text-moss">Schritt 3</p>
              <h2 className="headline mt-1 text-xl">Ausprobieren und Rückmeldung geben</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                Mach in der App einfach einen Screenshot – TestFlight fragt dann, ob du ihn mit einem Kommentar als Feedback senden möchtest. Alternativ in TestFlight auf {BRAND.name} → „Feedback senden“.
              </p>
              <p className="mt-4 text-sm font-semibold text-ink">Was du zum Beispiel ausprobieren kannst:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-ink-2">
                {TRY.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </li>
          </ol>

          <aside className="space-y-4">
            {qr && (
              <div className="hidden rounded-2xl border border-line bg-card p-5 text-center md:block">
                <p className="text-sm font-semibold text-ink">Am Computer? Mit dem iPhone scannen:</p>
                <div className="mx-auto mt-4 size-[180px] [&_svg]:size-full" aria-label="QR-Code zur Beta-Einladung" role="img" dangerouslySetInnerHTML={{ __html: qr }} />
              </div>
            )}
            <div className="rounded-2xl border border-line bg-card p-5 text-[14px] leading-relaxed text-ink-2">
              <p className="font-semibold text-ink">Gut zu wissen</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>Du brauchst ein iPhone mit iOS 26.1 oder neuer.</li>
                <li>Die Beta nutzt dein normales {BRAND.name}-Konto – Projekte und Beiträge sind echt und für andere sichtbar.</li>
                <li>Creator Pro lässt sich in der Beta kostenlos testen (Testkauf über Apple). Bestellungen im Marktplatz sind dagegen echte Bestellungen.</li>
                <li>Apple übermittelt uns dein Feedback und Absturzberichte, damit wir Fehler beheben können.</li>
              </ul>
              <p className="mt-3">
                Fragen? <Link href="/kontakt" className="text-moss underline underline-offset-2">Schreib uns</Link>.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
