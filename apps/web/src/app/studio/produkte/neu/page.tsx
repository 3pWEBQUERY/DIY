import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { PageHeader } from "@/components/shell/page";
import { ProductEditor } from "@/components/commerce/product-editor";
import { categoryOptions } from "@/server/categories/settings";
import { loadEditor } from "../editor-data";

export const metadata: Metadata = { title: "Neues Produkt" };

export default async function NewProductPage() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/studio/produkte/neu");
  const data = await loadEditor(user.id, null);
  if (!data?.initial) redirect("/studio/shop");
  if (data.shop.status === "SUSPENDED") redirect("/studio/shop");
  const categories = await categoryOptions();
  // Standardkategorie kann deaktiviert sein → erste aktive vorschlagen
  const initial = categories.some((c) => c.slug === data.initial.category) ? data.initial : { ...data.initial, category: categories[0]?.slug ?? data.initial.category };
  return (
    <div>
      <PageHeader kicker="Creator Studio · Produkte" title="Neues Produkt" description="Alles, was Käufer:innen wissen müssen – ehrlich, vollständig und mit dem Projekt dahinter." />
      <ProductEditor
        initial={initial}
        projects={data.links.projects}
        tutorials={data.links.tutorials}
        shopActive={data.shop.status === "ACTIVE"}
        shopReturnPolicy={data.shop.returnPolicy}
        feeBps={data.feeBps}
        digitalEnabled={data.digitalEnabled}
        categories={categories}
      />
    </div>
  );
}
