import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/**
 * Profilbild mit Story-Ring: Koralle = neue Stories, Haarlinie = alles gesehen.
 * Bewusst ohne Verlauf (Werkbuch-Regeln) – der Ring ist eine klare, durchgehende Linie
 * mit Papierabstand zum Bild.
 */
export function StoryAvatar({
  src,
  name,
  size = 64,
  state,
  className,
}: {
  src: string | null;
  name: string;
  size?: number;
  /** unseen: neue Stories · seen: alles gesehen · none: kein Ring */
  state: "unseen" | "seen" | "none";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full border-2 p-[3px] transition-colors",
        state === "unseen" ? "border-moss" : state === "seen" ? "border-line-strong" : "border-transparent",
        className,
      )}
    >
      <Avatar src={src} name={name} size={size} />
    </span>
  );
}
