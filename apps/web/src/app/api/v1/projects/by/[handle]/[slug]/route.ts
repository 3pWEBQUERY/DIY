import { api } from "@/server/api";
import { currentUser } from "@/server/auth/session";
import { getProjectPage } from "@/server/projects/service";
import { fail } from "@/server/errors";

/**
 * Projektdetail für die iOS-App: Datenblatt, Journal, Materialien, Anleitung, Nachbauten (§10.4).
 * Gleiche Sichtbarkeitsregeln wie Web und Mobile-API (`getProjectPage`): gesperrte/gelöschte Konten,
 * Sichtbarkeit, Moderationszustand, Original eines Nachbaus nur wenn sichtbar, Nachbauten ohne Blockierte.
 */
export const GET = api(async (_req, ctx: { params: Promise<{ handle: string; slug: string }> }) => {
  const { handle, slug } = await ctx.params;
  const viewer = await currentUser();
  const vid = viewer?.id ?? null;
  let r = await getProjectPage(handle, slug, vid);
  // Alter Benutzername → einmal der Weiterleitung folgen (/u/<neu>/<slug>)
  if (r?.kind === "redirect") {
    const [, , newHandle] = r.to.split("/");
    r = newHandle ? await getProjectPage(newHandle, slug, vid) : null;
  }
  if (!r || r.kind !== "ok") throw fail.notFound();
  const p = r.project;
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    category: p.category,
    tags: p.tags,
    status: p.status,
    difficulty: p.difficulty,
    estimatedMinutes: p.estimatedMinutes,
    actualMinutes: p.actualMinutes,
    budgetMinor: p.budgetMinor,
    currency: p.currency,
    coverUrl: p.coverUrl,
    owner: { userId: p.owner.id, handle: p.owner.handle, displayName: p.owner.displayName, avatarUrl: p.owner.avatarUrl },
    gallery: p.gallery.map((m) => ({ id: m.id, alt: m.alt, variants: m.variants })),
    journal: p.journal.map((u) => ({ id: u.id, body: u.body, milestone: u.milestone, problem: u.problem, solution: u.solution, minutes: u.minutes, happenedAt: u.happenedAt, media: u.media })),
    materials: p.materials.map((m) => ({ name: m.name, quantity: m.quantity, note: m.note })),
    tools: p.tools.map((t) => ({ name: t.name, note: t.note })),
    tutorials: p.tutorials.filter((t) => t.state === "PUBLISHED").map((t) => ({ id: t.id, slug: t.slug, title: t.title, minutes: t.minutes, difficulty: t.difficulty })),
    remixes: p.remixes.map((x) => ({ id: x.id, slug: x.slug, title: x.title, coverUrl: x.coverUrl, category: x.category, deviations: x.deviations, owner: { handle: x.owner.handle, displayName: x.owner.displayName } })),
    remixOf: p.remixOf ? { slug: p.remixOf.slug, title: p.remixOf.title, owner: { handle: p.remixOf.ownerHandle, displayName: p.remixOf.ownerName } } : null,
    counts: { likes: p.counts.likes, saves: p.counts.saves, remixes: p.counts.remixes, comments: p.counts.comments },
    viewer: { liked: p.viewer.liked, saved: p.viewer.saved, isOwner: p.viewer.isOwner },
  };
});
