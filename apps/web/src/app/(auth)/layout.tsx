import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { ThreadDrawing } from "@/components/landing/thread-drawing";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="w-fit" aria-label="Zur Startseite">
          <Wordmark />
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
          {children}
        </main>
        <footer className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          <Link href="/rechtliches/datenschutz" className="hover:text-ink">Datenschutz</Link>
          <Link href="/rechtliches/agb" className="hover:text-ink">Nutzungsbedingungen</Link>
          <Link href="/rechtliches/impressum" className="hover:text-ink">Impressum</Link>
          <Link href="/hilfe" className="hover:text-ink">Hilfe</Link>
        </footer>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-rule bg-sunken lg:block" aria-hidden>
        <div className="grid-paper absolute inset-0 opacity-70" />
        <div className="absolute inset-0 flex flex-col justify-between p-12">
          <div className="flex justify-between spec text-ink">
            <span>Werkblatt Nº 001</span>
            <span>Massstab 1:1</span>
          </div>
          <ThreadDrawing className="mx-auto w-[78%] max-w-[560px] text-ink" />
          <div>
            <p className="display max-w-md text-4xl text-ink">„Jedes Projekt beginnt mit einem einzigen Faden.“</p>
            <div className="mt-6 flex items-center gap-6 spec">
              <span className="flex items-center gap-2"><span className="size-2 bg-moss rounded-full" />Idee</span>
              <span className="flex items-center gap-2"><span className="size-2 bg-ink rounded-full" />Journal</span>
              <span className="flex items-center gap-2"><span className="size-2 bg-clay rounded-full" />Anleitung</span>
              <span className="flex items-center gap-2"><span className="size-2 border border-rule rounded-full" />Nachbau</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
