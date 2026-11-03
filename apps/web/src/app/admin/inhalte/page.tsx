import Link from "next/link";
import type { Metadata } from "next";
import { DIFFICULTY_LABEL, PROJECT_STATUS_LABEL, categoryBySlug } from "@werkraum/shared";
import { adminPage } from "@/server/admin/guard";
import { listProjects, listTutorials } from "@/server/admin/content";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Pager, Segments, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { ActionButton, ReasonButton } from "@/components/admin/action-controls";
import { Badge } from "@/components/ui/misc";
import { num, shortDate } from "@/components/admin/format";
import { setFeaturedAction, setHiddenAction } from "./actions";

export const metadata: Metadata = { title: "Inhalte" };

type SP = { typ?: string; q?: string; zustand?: string; hervorgehoben?: string; seite?: string };

const STATE_LABEL: Record<string, string> = { PUBLISHED: "Veröffentlicht", DRAFT: "Entwurf", HIDDEN: "Ausgeblendet", REMOVED: "Entfernt" };
const stateTone = (s: string) => (s === "PUBLISHED" ? "moss" : s === "DRAFT" ? "neutral" : "danger") as "moss" | "neutral" | "danger";

export default async function ContentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await adminPage("PLATFORM_MODERATOR", "/admin/inhalte");
  const sp = await searchParams;
  const typ = sp.typ === "anleitungen" ? "anleitungen" : "projekte";
  const page = Math.max(1, Number(sp.seite) || 1);
  const opts = { q: sp.q?.trim() || null, state: sp.zustand ?? null, featured: sp.hervorgehoben === "1", page };
  const qs = (patch: Partial<SP>) => `/admin/inhalte?${new URLSearchParams(Object.entries({ ...sp, typ, ...patch }).filter(([, v]) => v) as [string, string][])}`;

  const projects = typ === "projekte" ? await listProjects(user, opts) : null;
  const tutorials = typ === "anleitungen" ? await listTutorials(user, opts) : null;
  const meta = projects ?? tutorials!;

  const filters = (
    <FilterBar>
      <input type="hidden" name="typ" value={typ} />
      <FilterField label="Suche">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Titel, @handle oder ID" className={`${filterInput} w-60`} />
      </FilterField>
      <FilterField label="Zustand">
        <select name="zustand" defaultValue={sp.zustand ?? ""} className={filterInput}>
          <option value="">Alle</option>
          {Object.entries(STATE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </FilterField>
      <label className="flex h-9 items-center gap-2 text-[13px]">
        <input type="checkbox" name="hervorgehoben" value="1" defaultChecked={opts.featured} className="accent-[var(--color-ink)]" />
        Nur hervorgehobene
      </label>
    </FilterBar>
  );

  const controls = (kind: "PROJECT" | "TUTORIAL", id: string, state: string, featured: boolean, publicOk: boolean) => (
    <div className="flex justify-end gap-1.5">
      {state === "PUBLISHED" && publicOk && (
        <ActionButton action={setFeaturedAction.bind(null, kind, id, !featured)} label={featured ? "Nicht mehr hervorheben" : "Hervorheben"} variant={featured ? "ghost" : "outline"} />
      )}
      {state === "PUBLISHED" && (
        <ReasonButton action={setHiddenAction.bind(null, kind, id, true)} label="Ausblenden" variant="ghost" title="Inhalt ausblenden" description="Der Inhalt ist danach nur noch für die Person selbst sichtbar. Für Regelverstösse besser einen Moderationsfall nutzen." confirmLabel="Ausblenden" />
      )}
      {state === "HIDDEN" && <ReasonButton action={setHiddenAction.bind(null, kind, id, false)} label="Wieder anzeigen" variant="ghost" title="Inhalt wieder anzeigen" confirmLabel="Anzeigen" />}
    </div>
  );

  return (
    <div>
      <AdminHeader n="06" title="Inhalte" description="Projekte und Anleitungen kuratieren: hervorheben für Entdecken & Startseite oder vorübergehend ausblenden. Entfernen erfolgt ausschliesslich über einen begründeten Moderationsfall." />
      <Segments
        active={typ}
        items={[
          { key: "projekte", label: "Projekte", href: "/admin/inhalte?typ=projekte" },
          { key: "anleitungen", label: "Anleitungen", href: "/admin/inhalte?typ=anleitungen" },
        ]}
      />
      {filters}
      <p className="spec mb-2">{num(meta.total)} Einträge</p>

      {projects && (
        <Table caption="Projekte">
          <thead>
            <tr>
              <Th>Projekt</Th>
              <Th>Kategorie</Th>
              <Th>Status</Th>
              <Th>Zustand</Th>
              <Th align="right">Material</Th>
              <Th align="right">Gemerkt</Th>
              <Th align="right">Nachbauten</Th>
              <Th>Aktualisiert</Th>
              <Th align="right">Aktionen</Th>
            </tr>
          </thead>
          <tbody>
            {projects.rows.length === 0 && <EmptyRow cols={9}>Keine Projekte gefunden.</EmptyRow>}
            {projects.rows.map((p) => (
              <Tr key={p.id}>
                <Td className="max-w-[300px]">
                  <Link href={`/u/${p.owner.profile?.handle}/${p.slug}`} target="_blank" className="font-semibold hover:underline">
                    {p.title}
                  </Link>
                  {p.isFeatured && <Badge tone="clay" className="ml-2">Hervorgehoben</Badge>}
                  <span className="block text-xs text-muted">@{p.owner.profile?.handle} · {p.visibility === "PUBLIC" ? "öffentlich" : p.visibility === "FOLLOWERS" ? "Follower" : "privat"}</span>
                </Td>
                <Td className="whitespace-nowrap">{categoryBySlug(p.category)?.short ?? p.category}</Td>
                <Td className="whitespace-nowrap">{PROJECT_STATUS_LABEL[p.status]}</Td>
                <Td><Badge tone={stateTone(p.state)}>{STATE_LABEL[p.state]}</Badge></Td>
                <Td align="right">{p._count.materials ? num(p._count.materials) : <span className="text-muted">–</span>}</Td>
                <Td align="right">{num(p.saveCount)}</Td>
                <Td align="right">{num(p.remixCount)}</Td>
                <Td className="whitespace-nowrap text-muted">{shortDate(p.updatedAt)}</Td>
                <Td>{controls("PROJECT", p.id, p.state, p.isFeatured, p.visibility === "PUBLIC")}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {tutorials && (
        <Table caption="Anleitungen">
          <thead>
            <tr>
              <Th>Anleitung</Th>
              <Th>Kategorie</Th>
              <Th>Niveau</Th>
              <Th>Zustand</Th>
              <Th>Sicherheit</Th>
              <Th align="right">Aufrufe</Th>
              <Th align="right">Abgeschl.</Th>
              <Th>Aktualisiert</Th>
              <Th align="right">Aktionen</Th>
            </tr>
          </thead>
          <tbody>
            {tutorials.rows.length === 0 && <EmptyRow cols={9}>Keine Anleitungen gefunden.</EmptyRow>}
            {tutorials.rows.map((t) => (
              <Tr key={t.id}>
                <Td className="max-w-[300px]">
                  <Link href={`/anleitungen/${t.slug}`} target="_blank" className="font-semibold hover:underline">
                    {t.title}
                  </Link>
                  {t.isFeatured && <Badge tone="clay" className="ml-2">Hervorgehoben</Badge>}
                  <span className="block text-xs text-muted">@{t.author.profile?.handle}{t.isPaid ? " · kostenpflichtig" : ""}</span>
                </Td>
                <Td className="whitespace-nowrap">{categoryBySlug(t.category)?.short ?? t.category}</Td>
                <Td className="whitespace-nowrap">{DIFFICULTY_LABEL[t.difficulty]}</Td>
                <Td><Badge tone={stateTone(t.state)}>{STATE_LABEL[t.state]}</Badge></Td>
                <Td>{t.safetyKinds.length ? <Badge tone="warn">{t.safetyKinds.length} Hinweise</Badge> : <span className="text-muted">–</span>}</Td>
                <Td align="right">{num(t.viewCount)}</Td>
                <Td align="right">{num(t.completionCount)}</Td>
                <Td className="whitespace-nowrap text-muted">{shortDate(t.updatedAt)}</Td>
                <Td>{controls("TUTORIAL", t.id, t.state, t.isFeatured, true)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={meta.page} pages={meta.pages} href={(p) => qs({ seite: String(p) })} />
    </div>
  );
}
