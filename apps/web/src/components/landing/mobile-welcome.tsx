import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { cn } from "@/lib/utils";
import { pickWelcomeBackground } from "./welcome-pick";
import { WelcomePickFallback } from "./welcome-pick-fallback";
import { IosBetaHint } from "./ios-beta-hint";

/**
 * Mobile Startseite (nur unter md): ruhiger Willkommensbildschirm mit grossem Werkstatt-Bild oben, das weich
 * in ein tiefes Nachtblau übergeht; darunter Botschaft, Konto erstellen, Apple/Pinterest und „Erst einmal umsehen“.
 *
 * Bei jedem Besuch erscheint ein anderes Bild (nie zweimal dasselbe hintereinander). Die Startseite wird
 * zwischengespeichert ausgeliefert, darum wählt ein kleines Skript direkt beim Laden der Seite (noch vor dem
 * Rest von React) das Bild und setzt `data-show`. Das Hintergrundbild steht nur in der CSS-Regel des gewählten
 * Bildes, die anderen werden also gar nicht geladen. `focus` ist die senkrechte Bildmitte des Motivs, damit es
 * im Ausschnitt oben sichtbar bleibt.
 */
const BACKGROUNDS = [
  // Bild nur in der jeweils passenden Regel – so lädt der Browser ausschliesslich das gewählte
  { src: "/welcome/werkzeug.webp", focus: 44, show: "group-data-[show=0]/bg:block group-data-[show=0]/bg:bg-[url(/welcome/werkzeug.webp)]" },
  { src: "/welcome/material.webp", focus: 42, show: "group-data-[show=1]/bg:block group-data-[show=1]/bg:bg-[url(/welcome/material.webp)]" },
  { src: "/welcome/garn.webp", focus: 50, show: "group-data-[show=2]/bg:block group-data-[show=2]/bg:bg-[url(/welcome/garn.webp)]" },
  { src: "/welcome/vase.webp", focus: 44, show: "group-data-[show=3]/bg:block group-data-[show=3]/bg:bg-[url(/welcome/vase.webp)]" },
] as const;

/** Grundfarbe unter dem Bild – das Nachtblau der Motive */
const NIGHT = "#0d1626";

const BG_ID = "welcome-bg";
/** Läuft beim Laden der Seite sofort, noch vor React (siehe welcome-pick.ts) */
const PICK = `(${pickWelcomeBackground.toString()})(document.currentScript.parentElement, ${BACKGROUNDS.length})`;

export function MobileWelcome({ apple, pinterest, beta = false }: { apple: boolean; pinterest: boolean; beta?: boolean }) {
  return (
    <section aria-label="Willkommen bei Werkuno" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden text-white md:hidden" style={{ backgroundColor: NIGHT }}>
      {/* Bild oben, weich ins Nachtblau auslaufend */}
      <div id={BG_ID} aria-hidden className="group/bg absolute inset-x-0 top-0 -z-10 h-[68svh] overflow-hidden" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: PICK }} />
        {BACKGROUNDS.map((b) => (
          <div
            key={b.src}
            className={cn("absolute inset-0 hidden animate-settle bg-cover bg-no-repeat motion-reduce:animate-fade", b.show)}
            style={{ backgroundPosition: `50% ${b.focus}%` }}
          />
        ))}
        <WelcomePickFallback id={BG_ID} count={BACKGROUNDS.length} />
        {/* oben leicht abdunkeln für Logo und Anmelden */}
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/45 to-transparent" />
        {/* unten ins Nachtblau */}
        <div className="absolute inset-x-0 bottom-0 h-[58%]" style={{ background: `linear-gradient(to bottom, transparent, ${NIGHT}cc 55%, ${NIGHT})` }} />
      </div>

      <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),14px)]">
        <Link href="/" aria-label="Werkuno – Startseite">
          <Wordmark height={26} tone="light" />
        </Link>
        <Link
          href="/anmelden"
          className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-[14px] font-semibold text-white backdrop-blur-md transition-colors active:scale-[0.97] active:bg-white/20"
        >
          Anmelden
        </Link>
      </header>

      {/* iOS-Beta: nur auf iPhones und nur mit gesetztem TestFlight-Link */}
      {beta && (
        <div className="absolute left-5 top-[calc(max(env(safe-area-inset-top),14px)+56px)]">
          <IosBetaHint variant="chip" />
        </div>
      )}

      {/* kurze Bildschirme (z. B. iPhone SE): weniger Abstand, damit alles ohne Scrollen passt */}
      <div className="min-h-[30svh] flex-1 [@media(max-height:700px)]:min-h-[8svh]" />

      <div className="px-6 pb-[max(env(safe-area-inset-bottom),18px)]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#e2bd84]">Das Netzwerk für Selbstgemachtes</p>
        <h1 className="display mt-3 text-[42px] leading-[1.02] text-white [@media(max-height:700px)]:mt-2 [@media(max-height:700px)]:text-[36px]">
          Ein Faden.
          <br />
          <span className="text-[#e2bd84]">Unzählige</span> Projekte.
        </h1>
        <p className="mt-3.5 max-w-[32ch] text-[16px] leading-relaxed text-white/75 [@media(max-height:700px)]:mt-2.5 [@media(max-height:700px)]:text-[15px]">
          Projekte festhalten, mit Anleitungen lernen und Handgemachtes kaufen und verkaufen.
        </p>

        <div className="mt-7 space-y-2.5 [@media(max-height:700px)]:mt-5 [@media(max-height:700px)]:space-y-2">
          <Link href="/registrieren" className="flex h-[52px] w-full items-center justify-center rounded-full bg-moss text-[16px] font-semibold text-paper shadow-[0_12px_30px_-12px_rgba(182,75,58,0.9)] active:scale-[0.98]">
            Konto erstellen – kostenlos
          </Link>
          {apple && (
            <a href="/api/auth/apple" className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-[#111] active:scale-[0.98]">
              <svg width="15" height="18" viewBox="0 0 16 19" aria-hidden fill="currentColor">
                <path d="M13.2 10.1c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.8C3.6 4.8 2.1 5.7 1.3 7.2c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.6-1-2.7-4.1zM10.8 3c.6-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z" />
              </svg>
              Mit Apple fortfahren
            </a>
          )}
          {pinterest && (
            <a href="/api/auth/pinterest" className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/[0.06] text-[16px] font-semibold text-white active:scale-[0.98]">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="#E60023">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.16 9.42 7.62 11.17-.1-.95-.2-2.4.04-3.44l1.4-5.96s-.36-.72-.36-1.78c0-1.67.97-2.92 2.17-2.92 1.02 0 1.52.77 1.52 1.7 0 1.03-.66 2.58-1 4.01-.28 1.2.6 2.18 1.79 2.18 2.14 0 3.79-2.26 3.79-5.52 0-2.89-2.08-4.9-5.04-4.9-3.43 0-5.45 2.57-5.45 5.24 0 1.04.4 2.15.9 2.75.1.12.11.23.08.35l-.33 1.37c-.05.22-.18.27-.41.16-1.5-.7-2.44-2.89-2.44-4.66 0-3.79 2.75-7.27 7.94-7.27 4.17 0 7.41 2.97 7.41 6.94 0 4.14-2.61 7.47-6.23 7.47-1.22 0-2.36-.63-2.75-1.38l-.75 2.85c-.27 1.04-1 2.35-1.49 3.15A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Mit Pinterest fortfahren
            </a>
          )}
          <Link href="/entdecken" className="block py-2 text-center text-[15px] font-semibold text-white/85 underline-offset-4 active:underline">
            Erst einmal umsehen
          </Link>
        </div>

        <p className="mt-1 text-center text-[11.5px] leading-snug text-white/50">
          Ab 18 Jahren. Mit der Registrierung akzeptierst du die{" "}
          <Link href="/rechtliches/agb" className="underline underline-offset-2">Nutzungsbedingungen</Link> und die{" "}
          <Link href="/rechtliches/datenschutz" className="underline underline-offset-2">Datenschutzerklärung</Link>.
        </p>
      </div>
    </section>
  );
}
