import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { browseMaterials, listMaterialCategories } from "@/server/materials/service";
import { Page, PageHeader, TabLinks } from "@/components/shell/page";
import { ChipLink, ChipRow } from "@/components/ui/chips";
import { Empty } from "@/components/ui/misc";

type SP = { kategorie?: string; q?: string; nach?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  return { title: sp.q ? `Material «${sp.q}»` : "Materialien", description: "Die Materialdatenbank der Community: Garne, Stoffe, Hölzer, Farben und mehr – mit Einheiten, Eigenschaften und Sicherheitshinweisen." };
}

function formatProp(v: unknown) {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const [categories, result] = await Promise.all([listMaterialCategories(), browseMaterials({ categorySlug: sp.kategorie, q, cursor: sp.nach ?? null })]);
  const active = categories.find((c) => c.slug === sp.kategorie);
  const href = (patch: Partial<SP>) => {
    const next = { kategorie: active?.slug, q, ...patch };
    const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1])).toString();
    return `/materialien${qs ? `?${qs}` : ""}`;
  };

  return (
    <Page width="wide">
      <PageHeader kicker="Materialkunde" title={active ? active.name : "Materialien"} description="Woraus entsteht es? Die Materialdatenbank verbindet Projekte, Anleitungen und Einkaufslisten – mit Einheiten, Eigenschaften und Sicherheitshinweisen." />
      <TabLinks
        active="materialien"
        tabs={[
          { key: "projekte", label: "Projekte", href: "/projekte" },
          { key: "anleitungen", label: "Anleitungen", href: "/anleitungen" },
          { key: "materialien", label: "Materialien", href: "/materialien" },
        ]}
      />
      <div className="mt-6 space-y-4 border-b border-line pb-6">
        <Form action="/materialien" className="relative max-w-md" role="search">
          {active && <input type="hidden" name="kategorie" value={active.slug} />}
          <label htmlFor="mq" className="sr-only">Materialien durchsuchen</label>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input id="mq" name="q" defaultValue={q} placeholder="z. B. Merino, Eiche, Acrylfarbe …" className="h-10 w-full border border-line-strong bg-card pl-9 pr-3 text-[14px] outline-none hover:border-muted focus:border-moss rounded-2xl" />
        </Form>
        {categories.length > 0 && (
          <ChipRow label="Gruppe">
            <ChipLink href={href({ kategorie: undefined, nach: undefined })} active={!active}>Alle</ChipLink>
            {categories.map((c) => (
              <ChipLink key={c.id} href={href({ kategorie: c.slug, nach: undefined })} active={active?.id === c.id} count={c._count.materials}>{c.name}</ChipLink>
            ))}
          </ChipRow>
        )}
      </div>

      {result.items.length ? (
        <>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[14px]">
              <caption className="sr-only">Materialien</caption>
              <thead>
                <tr className="border-b border-rule text-left">
                  <th scope="col" className="spec py-2 pr-4 font-normal">Material</th>
                  <th scope="col" className="spec py-2 pr-4 font-normal">Art</th>
                  <th scope="col" className="spec py-2 pr-4 font-normal">Eigenschaften</th>
                  <th scope="col" className="spec py-2 pr-4 font-normal">Einheit</th>
                  <th scope="col" className="spec py-2 text-right font-normal">In Projekten</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((m) => {
                  const props = Object.entries(m.properties).slice(0, 4);
                  return (
                    <tr key={m.id} className="border-b border-line align-top">
                      <td className="py-3 pr-4">
                        <span className="headline block text-[1.1rem]">{m.name}</span>
                        <span className="spec">{[m.category.name, m.brand].filter(Boolean).join(" · ")}</span>
                        {m.notes && <span className="mt-1 block max-w-[46ch] text-[13px] text-muted">{m.notes}</span>}
                        {m.safetyInfo && <span className="mt-1 block max-w-[46ch] text-[12px] text-warn">Sicherheit: {m.safetyInfo}</span>}
                      </td>
                      <td className="py-3 pr-4 text-ink-2">{m.type}</td>
                      <td className="py-3 pr-4">
                        {props.length ? (
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
                            {props.map(([k, v]) => (
                              <div key={k} className="contents">
                                <dt className="spec">{k}</dt>
                                <dd className="text-ink-2">{formatProp(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <span className="text-muted">–</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-[12px]">{m.unit}</td>
                      <td className="py-3 text-right num">
                        {m.usedIn > 0 ? <Link href={`/projekte?q=${encodeURIComponent(m.name)}`} className="hover:underline">{m.usedIn}</Link> : <span className="text-muted">0</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result.nextCursor && (
            <div className="mt-8 flex justify-center">
              <Link href={href({ nach: result.nextCursor })} className="border border-line px-6 py-3 text-sm font-semibold text-muted hover:border-rule-strong hover:text-ink rounded-2xl">Weitere Materialien</Link>
            </div>
          )}
        </>
      ) : (
        <Empty className="mt-8" title={q ? "Kein Material gefunden" : "Noch keine Materialien"} body={q ? "Versuche einen anderen Begriff. In Materiallisten kannst du auch frei Bezeichnungen eintragen." : "Die Materialdatenbank wird von der Redaktion gepflegt."} />
      )}
    </Page>
  );
}
