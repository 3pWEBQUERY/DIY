import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DIFFICULTY_LABEL, VISIBILITY, categoryBySlug, listCategories } from "@werkraum/shared";
import { AppError } from "@/server/errors";
import { adminPage } from "@/server/admin/guard";
import { getProjectDetail } from "@/server/admin/content-detail";
import { dateTime } from "@/components/admin/format";
import { Avatar, Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { MetaList, Mono, STATE_LABEL, VISIBILITY_SHORT, stateTone } from "../../../_components/detail";
import { ProjectEditForm } from "./edit-form";

export const metadata: Metadata = { title: "Projekt bearbeiten" };

export default async function AdminProjectEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/inhalte/projekte/${id}/bearbeiten`);
  let d;
  try {
    d = await getProjectDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const p = d.project;
  const back = `/admin/inhalte/projekte/${p.id}`;

  return (
    <div>
      <Link href={back} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Zurück zum Projekt
      </Link>
      <header className="mb-8 border-b border-rule pb-5">
        <p className="spec mb-1">Projekt bearbeiten · {p.id}</p>
        <h1 className="display break-words text-[2.2rem]">{p.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/admin/nutzer/${p.owner.id}`} className="inline-flex items-center gap-1.5 text-ink-2 hover:underline">
            <Avatar src={p.owner.profile?.avatarUrl} name={p.owner.profile?.displayName ?? "?"} size={20} />@{p.owner.profile?.handle ?? "–"}
          </Link>
          <Badge tone={stateTone(p.state)}>{STATE_LABEL[p.state]}</Badge>
          <Badge tone="outline">{VISIBILITY_SHORT[p.visibility]}</Badge>
        </div>
      </header>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 max-w-3xl" aria-labelledby="edit-title">
          <SectionTitle n="01" title={<span id="edit-title">Angaben</span>} />
          {p.state === "REMOVED" ? (
            <Notice tone="danger" title="Projekt entfernt">
              Entfernte Projekte können nicht bearbeitet werden. Stelle das Projekt zuerst auf der Projektseite wieder her.
            </Notice>
          ) : (
            <ProjectEditForm
              id={p.id}
              values={{ title: p.title, summary: p.description, category: p.category, visibility: p.visibility, difficulty: p.difficulty, tags: p.tags }}
              categories={listCategories().map((c) => ({ value: c.slug, label: c.short + (c.isActive ? "" : " (inaktiv)") }))}
              visibilities={VISIBILITY.map((v) => ({ value: v, label: VISIBILITY_SHORT[v] ?? v }))}
              difficulties={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: DIFFICULTY_LABEL[n] ?? String(n) }))}
            />
          )}
        </section>

        <aside className="space-y-8" aria-label="Hinweise und Stammdaten">
          <section>
            <SectionTitle n="02" title="Gut zu wissen" />
            <ul className="space-y-2.5 text-[13.5px] leading-relaxed text-ink-2">
              <li>Der Link (Slug) bleibt unverändert – bestehende Verweise funktionieren weiter.</li>
              <li>Die Sichtbarkeit lässt sich nur einschränken. Erweitern kann sie nur die Person selbst.</li>
              <li>Jede Änderung wird mit Begründung im Audit-Protokoll gespeichert, und die Person erhält einen Hinweis.</li>
              <li>Bilder, Journal und Materialien bearbeitet die Person selbst.</li>
            </ul>
          </section>
          <section>
            <SectionTitle n="03" title="Stammdaten" />
            <MetaList
              items={[
                ["ID", <Mono key="id">{p.id}</Mono>],
                ["Slug", <Mono key="slug">{p.slug}</Mono>],
                ["Kategorie", categoryBySlug(p.category)?.name ?? p.category],
                ["Erstellt", dateTime(p.createdAt)],
                ["Aktualisiert", dateTime(p.updatedAt)],
              ]}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
