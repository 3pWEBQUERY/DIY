import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@werkraum/shared";
import { cn } from "@/lib/utils";

/**
 * Statusmarke im Werkbuch-Stil: ein Knoten wie auf dem Projektfaden.
 * Idee/Planung hohl, in Arbeit Terrakotta, abgeschlossen Moos.
 */
const MARK: Record<ProjectStatus, string> = {
  IDEA: "border border-rule bg-transparent rounded-full",
  PLANNING: "border border-rule bg-transparent rounded-2xl",
  IN_PROGRESS: "bg-clay",
  PAUSED: "border border-muted bg-line-strong rounded-2xl",
  COMPLETED: "bg-moss",
  ARCHIVED: "bg-muted",
};

export function StatusMark({ status, className }: { status: ProjectStatus; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", MARK[status], className)} />;
}

export function StatusLabel({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <StatusMark status={status} />
      {PROJECT_STATUS_LABEL[status]}
    </span>
  );
}
