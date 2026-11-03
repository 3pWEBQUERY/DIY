"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser, currentUser } from "@/server/auth/session";
import * as projects from "@/server/projects/service";

/** Server Actions für Projekte (PRD §10). Berechtigungen prüft der Service. */

export async function createProjectAction(input: unknown) {
  return act(async () => {
    const r = await projects.createProject(await requireUser(), input);
    revalidatePath("/projekte");
    return r;
  }, "Projekt angelegt.");
}

export async function updateProjectAction(id: string, input: unknown) {
  return act(async () => {
    const r = await projects.updateProject(await requireUser(), id, input);
    revalidatePath(r.href);
    return r;
  }, "Änderungen gespeichert.");
}

export async function deleteProjectAction(id: string) {
  return act(async () => {
    await projects.deleteProject(await requireUser(), id);
    revalidatePath("/projekte");
    return null;
  }, "Projekt gelöscht.");
}

export async function setProjectStatusAction(id: string, status: string) {
  return act(async () => projects.setProjectStatus(await requireUser(), id, { status }), "Status aktualisiert.");
}

export async function addProjectUpdateAction(projectId: string, input: unknown) {
  return act(async () => {
    const r = await projects.addProjectUpdate(await requireUser(), projectId, input);
    revalidatePath(r.href);
    return r;
  }, "Fortschritt eingetragen.");
}

export async function deleteProjectUpdateAction(id: string) {
  return act(async () => {
    await projects.deleteProjectUpdate(await requireUser(), id);
    return null;
  }, "Eintrag gelöscht.");
}

export async function loadProjectsAction(filters: projects.ProjectFilters, cursor: string | null) {
  const u = await currentUser();
  return projects.listProjects(filters, u?.id ?? null, { cursor });
}
