import Link from "next/link";

/** Vollbild-Hinweis, wenn keine (sichtbaren) Stories bzw. kein Highlight vorhanden sind. */
export function StoryGone({ handle, highlight }: { handle?: string; highlight?: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#151312] px-6 text-center text-white">
      <div className="max-w-sm">
        <p className="spec text-white/60">{highlight ? "Highlight" : "Stories"}</p>
        <h1 className="display mt-2 text-3xl">{highlight ? "Dieses Highlight ist nicht verfügbar." : "Gerade keine Stories."}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-white/75">
          {highlight ? "Es wurde entfernt oder ist nur für Follower sichtbar." : "Stories bleiben 24 Stunden sichtbar. Diese sind abgelaufen, wurden gelöscht oder sind nur für Follower."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {handle && (
            <Link href={`/u/${handle}`} className="inline-flex h-11 items-center rounded-xl border border-white/40 px-5 text-sm font-semibold hover:bg-white/10">
              Zum Profil
            </Link>
          )}
          <Link href="/feed" className="inline-flex h-11 items-center rounded-xl bg-moss px-5 text-sm font-semibold hover:bg-moss-ink">
            Zum Feed
          </Link>
        </div>
      </div>
    </div>
  );
}
