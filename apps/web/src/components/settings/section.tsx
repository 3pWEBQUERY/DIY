import type { ReactNode } from "react";
import { SectionTitle } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** Abschnitt einer Einstellungsseite: nummerierter Titel, kurze Erklärung, Inhalt. */
export function SettingsSection({ n, title, description, children, className, id }: { n: string; title: string; description?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id ?? `s-${n}`} className={cn("mb-12", className)}>
      <SectionTitle n={n} title={<span id={id ?? `s-${n}`}>{title}</span>} />
      {description && <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
