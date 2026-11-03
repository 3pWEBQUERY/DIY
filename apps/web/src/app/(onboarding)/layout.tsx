import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex h-16 max-w-5xl items-center px-5 sm:px-8">
        <Link href="/" aria-label="Startseite">
          <Wordmark />
        </Link>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        {children}
      </main>
    </div>
  );
}
