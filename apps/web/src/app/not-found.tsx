import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-paper">
      <header className="px-6 py-5">
        <Link href="/" aria-label="Startseite">
          <Wordmark />
        </Link>
      </header>
      <main id="main" className="grid place-items-center px-6 pb-20">
        <div className="max-w-lg text-center">
          <svg viewBox="0 0 320 90" className="mx-auto mb-10 w-72 text-ink" aria-hidden>
            <path d="M10 60 C 60 60, 70 20, 120 20 S 160 60, 150 70" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M190 50 C 220 30, 250 70, 310 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 7" />
            <circle cx="150" cy="70" r="3" fill="#B46C4D" />
            <circle cx="190" cy="50" r="3" fill="#B46C4D" />
          </svg>
          <p className="spec">Fehler 404</p>
          <h1 className="display mt-3 text-5xl">Hier ist der Faden gerissen.</h1>
          <p className="mt-4 text-muted">Diese Seite gibt es nicht (mehr). Vielleicht wurde sie verschoben, umbenannt oder vom Autor entfernt.</p>
          <div className="mt-8 flex justify-center gap-3">
            <LinkButton href="/">Zur Startseite</LinkButton>
            <LinkButton href="/entdecken" variant="outline">Entdecken</LinkButton>
          </div>
        </div>
      </main>
    </div>
  );
}
