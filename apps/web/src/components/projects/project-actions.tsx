"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, GitFork, Pencil, Trash2 } from "lucide-react";
import { PROJECT_STATUS, PROJECT_STATUS_LABEL, type ProjectStatus } from "@werkraum/shared";
import { LikeButton, SaveButton, ShareButton, MoreMenu, useSafetyMenu, type MenuItem } from "@/components/social/actions";
import { buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { followProjectAction } from "@/app/(app)/social-actions";
import { deleteProjectAction, setProjectStatusAction } from "@/app/(app)/projekte/actions";
import { StatusMark } from "./status";
import { Select } from "@/components/ui/select";

type Props = {
  project: { id: string; title: string; href: string; status: ProjectStatus };
  owner: { id: string; handle: string; displayName: string };
  viewer: { signedIn: boolean; isOwner: boolean; liked: boolean; saved: boolean; followingProject: boolean };
  counts: { likes: number; followers: number };
};

/** Aktionsleiste einer Projektseite: Gefällt mir, Speichern, Folgen, Teilen, Nachbauen, Melden. */
export function ProjectActions({ project, owner, viewer, counts }: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(viewer.followingProject);
  const [followers, setFollowers] = useState(counts.followers);
  const [, start] = useTransition();
  const safety = useSafetyMenu({ targetType: "PROJECT", targetId: project.id, authorId: owner.id, authorName: owner.displayName });

  const toggleFollow = () => {
    if (!viewer.signedIn) return router.push(`/anmelden?weiter=${encodeURIComponent(project.href)}`);
    const next = !following;
    setFollowing(next);
    setFollowers((n) => n + (next ? 1 : -1));
    start(async () => {
      const r = await followProjectAction(project.id, next);
      if (!r.ok) {
        setFollowing(!next);
        setFollowers((n) => n + (next ? -1 : 1));
        toast(r.error, "error");
      } else if (r.message) toast(r.message);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-line py-3">
      <LikeButton type="PROJECT" id={project.id} liked={viewer.liked} count={counts.likes} />
      <SaveButton type="PROJECT" id={project.id} saved={viewer.saved} label />
      {!viewer.isOwner && (
        <button
          type="button"
          onClick={toggleFollow}
          aria-pressed={following}
          className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink", following && "text-ink")}
        >
          {following ? <BellRing size={17} strokeWidth={1.7} /> : <Bell size={17} strokeWidth={1.7} />}
          {following ? "Folge ich" : "Projekt folgen"}
          {followers > 0 && <span className="font-mono text-[11px] text-muted num">{followers}</span>}
        </button>
      )}
      <ShareButton url={project.href} title={project.title} />
      <div className="ml-auto flex items-center gap-2">
        {!viewer.isOwner && (
          <Link href={`/projekte/neu?nachbau=${project.id}`} className={buttonClass("outline", "sm")}>
            <GitFork size={14} /> Nachbauen
          </Link>
        )}
        {viewer.signedIn && !viewer.isOwner && <MoreMenu items={safety.items} label="Weitere Aktionen zum Projekt" />}
      </div>
      {safety.dialog}
    </div>
  );
}

/** Eigentümer-Werkzeugleiste: Bearbeiten, Status setzen, Löschen. */
export function ProjectOwnerBar({ project, ownerHandle }: { project: { id: string; href: string; status: ProjectStatus }; ownerHandle: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(project.status);
  const [pending, start] = useTransition();

  const changeStatus = (next: ProjectStatus) => {
    const prev = status;
    setStatus(next);
    start(async () => {
      const r = await setProjectStatusAction(project.id, next);
      if (!r.ok) {
        setStatus(prev);
        toast(r.error, "error");
      } else {
        toast(next === "COMPLETED" ? "Abgeschlossen – herzlichen Glückwunsch!" : `Status: ${PROJECT_STATUS_LABEL[next]}`);
        router.refresh();
      }
    });
  };

  const items: MenuItem[] = [
    { label: "Bearbeiten", icon: <Pencil size={15} />, onSelect: () => router.push(`${project.href}/bearbeiten`) },
    {
      label: "Projekt löschen",
      icon: <Trash2 size={15} />,
      danger: true,
      onSelect: () => {
        if (!confirm("Projekt endgültig löschen? Journal, Galerie und Materialliste werden entfernt. Verknüpfte Beiträge und Anleitungen bleiben bestehen.")) return;
        start(async () => {
          const r = await deleteProjectAction(project.id);
          if (r.ok) {
            toast("Projekt gelöscht.");
            router.push(`/u/${ownerHandle}`);
          } else toast(r.error, "error");
        });
      },
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 border border-rule bg-card px-3 py-2.5 rounded-2xl">
      <span className="spec text-ink">Deine Werkbank</span>
      <span className="h-4 w-px bg-line" aria-hidden />
      <label className="flex items-center gap-2 text-[13px]">
        <span className="sr-only">Projektstatus</span>
        <StatusMark status={status} />
        <Select
          value={status}
          disabled={pending}
          onChange={(e) => changeStatus(e.target.value as ProjectStatus)}
          className="h-9 w-auto min-w-[150px] text-[13px] font-semibold"
        >
          {PROJECT_STATUS.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </label>
      <div className="ml-auto flex items-center gap-2">
        <a href="#fortschritt" className={buttonClass("primary", "sm")}>
          Fortschritt eintragen
        </a>
        <Link href={`${project.href}/bearbeiten`} className={buttonClass("outline", "sm")}>
          <Pencil size={14} /> Bearbeiten
        </Link>
        <MoreMenu items={items} label="Projektverwaltung" />
      </div>
    </div>
  );
}
