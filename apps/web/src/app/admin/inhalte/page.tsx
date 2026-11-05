import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { DIFFICULTY_LABEL, PROJECT_STATUS_LABEL, categoryBySlug } from "@werkraum/shared";
import { adminPage } from "@/server/admin/guard";
import { listProjects, listTutorials } from "@/server/admin/content";
import { listArticles, listPosts } from "@/server/admin/content-detail";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Pager, Segments, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { ActionButton, ReasonButton } from "@/components/admin/action-controls";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { num, shortDate } from "@/components/admin/format";
import { Select } from "@/components/ui/select";
import { setDetailFeaturedAction, setDetailHiddenAction } from "./actions";
import { DETAIL_PATH, POST_KIND_LABEL, STATE_LABEL, VISIBILITY_SHORT, stateTone } from "./_components/detail";
import type { DetailKind } from "@/server/admin/content-detail";

export const metadata: Metadata = { title: "Inhalte" };

type SP = { typ?: string; q?: string; zustand?: string; hervorgehoben?: string; seite?: string };
type Typ = "projekte" | "anleitungen" | "beitraege" | "artikel";

const TYPES: { key: Typ; label: string; kind: DetailKind }[] = [
  { key: "projekte", label: "Projekte", kind: "PROJECT" },
  { key: "anleitungen", label: "Anleitungen", kind: "TUTORIAL" },
  { key: "beitraege", label: "Beiträge", kind: "POST" },
  { key: "artikel", label: "Artikel (Blog)", kind: "ARTICLE" },
];

const CONTENT_STATES = ["PUBLISHED", "DRAFT", "HIDDEN", "REMOVED"];
const ARTICLE_STATES = ["PUBLISHED", "DRAFT", "SCHEDULED", "HIDDEN"];

/** Titel → Admin-Detail; kleines Symbol → öffentliche Seite. */
function TitleCell({ kind, id, title, publicHref, children }: { kind: DetailKind; id: string; title: string; publicHref: string | null; children?: ReactNode }) {
  return (
    <Td className="max-w-[320px]">
      <span className="flex items-baseline gap-1.5">
        <Link href={`/admin/inhalte/${DETAIL_PATH[kind]}/${id}`} className="min-w-0 truncate font-semibold hover:underline">
          {title}
        </Link>
        {publicHref && (
          <Link href={publicHref} target="_blank" aria-label="Öffentliche Seite öffnen" title="Öffentliche Seite öffnen" className="shrink-0 text-muted hover:text-ink">
            <ExternalLink size={12} aria-hidden />
          </Link>
        )}
      </span>
      {children}
    </Td>
  );
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await adminPage("PLATFORM_MODERATOR", "/admin/inhalte");
  const sp = await searchParams;
  const typ: Typ = TYPES.some((t) => t.key === sp.typ) ? (sp.typ as Typ) : "projekte";
  const page = Math.max(1, Number(sp.seite) || 1);
  const opts = { q: sp.q?.trim() || null, state: sp.zustand ?? null, featured: sp.hervorgehoben === "1", page };
  const qs = (patch: Partial<SP>) => `/admin/inhalte?${new URLSearchParams(Object.entries({ ...sp, typ, ...patch }).filter(([, v]) => v) as [string, string][])}`;

  const projects = typ === "projekte" ? await listProjects(user, opts) : null;
  const tutorials = typ === "anleitungen" ? await listTutorials(user, opts) : null;
  const posts = typ === "beitraege" ? await listPosts(user, opts) : null;
  const articles = typ === "artikel" ? await listArticles(user, opts) : null;
  const meta = (projects ?? tutorials ?? posts ?? articles)!;
  const states = typ === "artikel" ? ARTICLE_STATES : CONTENT_STATES;

  const filters = (
    <FilterBar>
      <input type="hidden" name="typ" value={typ} />
      <FilterField label="Suche">
        <input name="q" defaultValue={sp.q ?? ""} placeholder={typ === "beitraege" ? "Text, @handle oder ID" : "Titel, @handle oder ID"} className={`${filterInput} w-60`} />
      </FilterField>
      <FilterField label="Zustand">
        <Select name="zustand" defaultValue={sp.zustand ?? ""} className="h-9 w-auto min-w-[160px] text-[13.5px]">
          <option value="">Alle</option>
          {states.map((k) => (
            <option key={k} value={k}>
              {STATE_LABEL[k]}
            </option>
          ))}
        </Select>
      </FilterField>
      {typ !== "beitraege" && (
        <label className="flex h-9 items-center gap-2 text-[13px]">
          <input type="checkbox" name="hervorgehoben" value="1" defaultChecked={opts.featured} className="accent-[var(--color-moss)]" />
          Nur hervorgehobene
        </label>
      )}
    </FilterBar>
  );

  const controls = (kind: DetailKind, id: string, state: string, featured: boolean | null, publicOk: boolean) => (
    <div className="flex justify-end gap-1.5">
      {featured !== null && state === "PUBLISHED" && publicOk && (
        <ActionButton action={setDetailFeaturedAction.bind(null, kind, id, !featured)} label={featured ? "Nicht mehr hervorheben" : "Hervorheben"} variant={featured ? "ghost" : "outline"} />
      )}
      {state === "PUBLISHED" && (
        <ReasonButton
          action={setDetailHiddenAction.bind(null, kind, id, true)}
          label="Ausblenden"
          variant="ghost"
          title="Inhalt ausblenden"
          description="Der Inhalt ist danach nur noch für die Person selbst sichtbar. Für Regelverstösse besser einen Moderationsfall nutzen."
          reasonLabel="Begründung"
          reasonHint="Wird protokolliert und der Person in der Benachrichtigung angezeigt."
          confirmLabel="Ausblenden"
        />
      )}
      {state === "HIDDEN" && <ReasonButton action={setDetailHiddenAction.bind(null, kind, id, false)} label="Wieder anzeigen" variant="ghost" title="Inhalt wieder anzeigen" confirmLabel="Anzeigen" />}
      <LinkButton href={`/admin/inhalte/${DETAIL_PATH[kind]}/${id}`} variant="outline" size="sm">
        Verwalten
      </LinkButton>
    </div>
  );

  return (
    <div>
      <AdminHeader
        n="06"
        title="Inhalte"
        description="Projekte, Anleitungen, Beiträge und Artikel verwalten: hervorheben, ausblenden, Angaben korrigieren und Kommentare moderieren. Jeder Eingriff ist begründet und protokolliert; Entfernen ist der Administration vorbehalten."
      />
      <Segments active={typ} items={TYPES.map((t) => ({ key: t.key, label: t.label, href: `/admin/inhalte?typ=${t.key}` }))} />
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
                <TitleCell kind="PROJECT" id={p.id} title={p.title} publicHref={p.state !== "REMOVED" && p.owner.profile?.handle ? `/u/${p.owner.profile.handle}/${p.slug}` : null}>
                  {p.isFeatured && <Badge tone="clay" className="mt-1">Hervorgehoben</Badge>}
                  <span className="block text-xs text-muted">@{p.owner.profile?.handle} · {VISIBILITY_SHORT[p.visibility]}</span>
                </TitleCell>
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
                <TitleCell kind="TUTORIAL" id={t.id} title={t.title} publicHref={t.state !== "REMOVED" ? `/anleitungen/${t.slug}` : null}>
                  {t.isFeatured && <Badge tone="clay" className="mt-1">Hervorgehoben</Badge>}
                  <span className="block text-xs text-muted">@{t.author.profile?.handle}{t.isPaid ? " · kostenpflichtig" : ""}</span>
                </TitleCell>
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

      {posts && (
        <Table caption="Beiträge">
          <thead>
            <tr>
              <Th>Beitrag</Th>
              <Th>Art</Th>
              <Th>Kategorie</Th>
              <Th>Zustand</Th>
              <Th align="right">Gefällt</Th>
              <Th align="right">Komm.</Th>
              <Th align="right">Medien</Th>
              <Th>Veröffentlicht</Th>
              <Th align="right">Aktionen</Th>
            </tr>
          </thead>
          <tbody>
            {posts.rows.length === 0 && <EmptyRow cols={9}>Keine Beiträge gefunden.</EmptyRow>}
            {posts.rows.map((p) => {
              const text = p.body.trim();
              return (
                <Tr key={p.id}>
                  <TitleCell kind="POST" id={p.id} title={text ? (text.length > 70 ? `${text.slice(0, 70)} …` : text) : `${POST_KIND_LABEL[p.kind] ?? "Beitrag"} ohne Text`} publicHref={p.state !== "REMOVED" ? `/beitrag/${p.id}` : null}>
                    <span className="block text-xs text-muted">
                      @{p.author.profile?.handle} · {VISIBILITY_SHORT[p.visibility]}
                      {p.community ? ` · ${p.community.name}` : ""}
                      {p.reachLimited ? " · Reichweite beschränkt" : ""}
                      {p.isCommercial ? " · Werbung" : ""}
                    </span>
                  </TitleCell>
                  <Td className="whitespace-nowrap">{POST_KIND_LABEL[p.kind] ?? p.kind}</Td>
                  <Td className="whitespace-nowrap">{p.category ? (categoryBySlug(p.category)?.short ?? p.category) : <span className="text-muted">–</span>}</Td>
                  <Td><Badge tone={stateTone(p.state)}>{STATE_LABEL[p.state]}</Badge></Td>
                  <Td align="right">{num(p.likeCount)}</Td>
                  <Td align="right">{num(p.commentCount)}</Td>
                  <Td align="right">{p._count.media ? num(p._count.media) : <span className="text-muted">–</span>}</Td>
                  <Td className="whitespace-nowrap text-muted">{shortDate(p.publishedAt)}</Td>
                  <Td>{controls("POST", p.id, p.state, null, false)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {articles && (
        <Table caption="Artikel">
          <thead>
            <tr>
              <Th>Artikel</Th>
              <Th>Rubrik</Th>
              <Th>Zustand</Th>
              <Th>Kommentare</Th>
              <Th align="right">Aufrufe</Th>
              <Th align="right">Gefällt</Th>
              <Th align="right">Lesezeit</Th>
              <Th>Aktualisiert</Th>
              <Th align="right">Aktionen</Th>
            </tr>
          </thead>
          <tbody>
            {articles.rows.length === 0 && <EmptyRow cols={9}>Keine Artikel gefunden.</EmptyRow>}
            {articles.rows.map((a) => (
              <Tr key={a.id}>
                <TitleCell kind="ARTICLE" id={a.id} title={a.title} publicHref={a.state === "PUBLISHED" && a.author.profile?.handle ? `/u/${a.author.profile.handle}/blog/${a.slug}` : null}>
                  {a.isFeatured && <Badge tone="clay" className="mt-1">Hervorgehoben</Badge>}
                  <span className="block text-xs text-muted">@{a.author.profile?.handle}</span>
                </TitleCell>
                <Td className="whitespace-nowrap">{a.category?.name ?? <span className="text-muted">–</span>}</Td>
                <Td><Badge tone={stateTone(a.state)}>{STATE_LABEL[a.state]}</Badge></Td>
                <Td className="whitespace-nowrap">{a.commentsEnabled ? <span className="text-muted">offen</span> : <Badge tone="outline">Gesperrt</Badge>}</Td>
                <Td align="right">{num(a.viewCount)}</Td>
                <Td align="right">{num(a.likeCount)}</Td>
                <Td align="right">{a.readingMinutes} Min.</Td>
                <Td className="whitespace-nowrap text-muted">{shortDate(a.updatedAt)}</Td>
                <Td>{controls("ARTICLE", a.id, a.state, a.isFeatured, true)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={meta.page} pages={meta.pages} href={(p) => qs({ seite: String(p) })} />
    </div>
  );
}
