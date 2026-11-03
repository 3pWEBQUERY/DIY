import Link from "next/link";
import { CATEGORIES, COUNTRY_LABEL, PRODUCT_KIND, PRODUCT_KIND_LABEL, SHIP_COUNTRIES } from "@werkraum/shared";
import { Input, Label, Select } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";

const SORT_LABEL: Record<string, string> = {
  neu: "Neueste zuerst",
  "preis-auf": "Preis aufsteigend",
  "preis-ab": "Preis absteigend",
  beliebt: "Am häufigsten gemerkt",
  bewertet: "Am besten bewertet",
};
export const MARKET_SORT_LABEL = SORT_LABEL;

/**
 * Filter als einfaches GET-Formular – funktioniert ohne JavaScript, Zustand steckt in der URL
 * (teilbar, zurück-Taste funktioniert). Kein Infinite-Scroll-Sog.
 */
export function MarketFilters({ raw, action = "/markt" }: { raw: Record<string, string>; action?: string }) {
  return (
    <form action={action} method="get" className="space-y-6" aria-label="Produkte filtern">
      {raw.q && <input type="hidden" name="q" value={raw.q} />}
      <div>
        <Label htmlFor="f-kategorie">Kategorie</Label>
        <Select id="f-kategorie" name="kategorie" defaultValue={raw.kategorie ?? ""}>
          <option value="">Alle Kategorien</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-semibold">Preis in CHF</legend>
        <div className="grid grid-cols-2 gap-2">
          <Input name="min" inputMode="numeric" placeholder="von" aria-label="Preis von" defaultValue={raw.min ?? ""} className="num h-10" />
          <Input name="max" inputMode="numeric" placeholder="bis" aria-label="Preis bis" defaultValue={raw.max ?? ""} className="num h-10" />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">Art</legend>
        <div className="space-y-1.5 text-[14px]">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="art" value="" defaultChecked={!raw.art} className="accent-[#3D604C]" />
            Alle
          </label>
          {PRODUCT_KIND.map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="art" value={k} defaultChecked={raw.art === k} className="accent-[#3D604C]" />
              {PRODUCT_KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-2.5 border-y border-line py-3 text-[14px]">
        <input type="checkbox" name="unikat" value="1" defaultChecked={raw.unikat === "1"} className="mt-0.5 size-4 accent-[#3D604C]" />
        <span>
          <span className="font-semibold">Nur Einzelstücke</span>
          <span className="block text-[12.5px] text-muted">Jedes Stück gibt es genau einmal.</span>
        </span>
      </label>

      <div>
        <Label htmlFor="f-versand">Versand ab</Label>
        <Select id="f-versand" name="versand" defaultValue={raw.versand ?? ""}>
          <option value="">Alle Länder</option>
          {SHIP_COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {COUNTRY_LABEL[c]}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="f-sort">Sortierung</Label>
        <Select id="f-sort" name="sort" defaultValue={raw.sort ?? "neu"}>
          {Object.entries(SORT_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className={buttonClass("ink", "md", "flex-1")}>
          Anwenden
        </button>
        <Link href={raw.q ? `${action}?q=${encodeURIComponent(raw.q)}` : action} className="text-[13px] text-muted underline underline-offset-2 hover:text-ink">
          Zurücksetzen
        </Link>
      </div>
    </form>
  );
}
