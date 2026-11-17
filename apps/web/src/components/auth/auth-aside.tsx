"use client";

import { usePathname } from "next/navigation";
import { BookOpen, Layers, MessageCircle, Store, Users, Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Point = { icon: LucideIcon; title: string; text: string };
type Copy = { kicker: string; title: string; lead: string; points: Point[] };

/** Für Mitglieder: was beim Anmelden wartet. */
const MEMBERS: Copy = {
  kicker: "Für Mitglieder",
  title: "Deine Werkbank wartet.",
  lead: "Melde dich an und mach dort weiter, wo du aufgehört hast.",
  points: [
    { icon: Layers, title: "Deine Projekte", text: "Journal, Zwischenstände und Entwürfe – alles an einem Ort." },
    { icon: Bell, title: "Was neu ist", text: "Beiträge von Leuten, denen du folgst, und Antworten auf deine Fragen." },
    { icon: MessageCircle, title: "Nachrichten & Bestellungen", text: "Direkt mit Mitgliedern und Shops schreiben." },
  ],
};

/** Für alle, die Mitglied werden wollen. */
const NEWCOMERS: Copy = {
  kicker: "Mitglied werden · kostenlos",
  title: "Kleine Ideen. Grosse Projekte.",
  lead: "Werkuno ist die Community für alle, die mit den Händen etwas machen – ob Holz, Garn, Stoff oder Ton.",
  points: [
    { icon: Layers, title: "Projekte dokumentieren", text: "Vom ersten Entwurf bis zum fertigen Stück, Schritt für Schritt." },
    { icon: BookOpen, title: "Anleitungen teilen", text: "Nachbauen, was andere zeigen – und eigenes Wissen weitergeben." },
    { icon: Users, title: "Communities finden", text: "Gruppen zu deinem Handwerk und in deiner Region." },
    { icon: Store, title: "Später verkaufen", text: "Mit eigenem Shop im Marktplatz, wenn du so weit bist." },
  ],
};

/**
 * Rechte Seite der Anmelde- und Registrierungsseiten: Werkstatt-Foto mit Informationen
 * für Mitglieder bzw. für alle, die es werden wollen. Das Foto ist hell – Text bleibt
 * deshalb auch im dunklen Modus dunkel.
 */
export function AuthAside() {
  const path = usePathname() ?? "";
  const copy = path.startsWith("/registrieren") ? NEWCOMERS : MEMBERS;
  return (
    <aside className="relative hidden overflow-hidden border-l border-rule bg-[#ece6e1] lg:block" aria-label="Über Werkuno">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/auth/werkstatt-1086.webp"
        srcSet="/auth/werkstatt-720.webp 720w, /auth/werkstatt-1086.webp 1086w"
        sizes="50vw"
        alt=""
        decoding="async"
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-[70%_center]"
      />
      {/* Weicher Verlauf von links über die freie Wand: Text bleibt lesbar, Pflanze und Werkzeug bleiben klar */}
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(242,237,232,0.88)_0%,rgba(242,237,232,0.6)_36%,rgba(242,237,232,0)_60%)]" aria-hidden />
      <div className="relative flex h-full flex-col p-12 text-[#262427] xl:p-14">
        <p className="spec text-[#973b2c]">{copy.kicker}</p>
        <h2 className="display mt-4 max-w-[11ch] text-5xl leading-[1.02] xl:text-6xl">{copy.title}</h2>
        <p className="mt-4 max-w-[38ch] text-[15px] leading-relaxed text-[#4a4446]">{copy.lead}</p>
        <ul className="mt-8 max-w-[400px] space-y-2.5">
          {copy.points.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3.5 rounded-2xl border border-white/60 bg-white/70 p-3.5 shadow-[0_1px_2px_rgba(38,36,39,0.06)] backdrop-blur-md">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f6e5e0] text-[#b64b3a]" aria-hidden>
                <Icon size={17} strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold leading-snug">{title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[#5b5457]">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
