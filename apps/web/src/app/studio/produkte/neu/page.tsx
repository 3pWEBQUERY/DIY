import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { PageHeader } from "@/components/shell/page";
import { ProductEditor } from "@/components/commerce/product-editor";
import { loadEditor } from "../editor-data";

export const metadata: Metadata = { title: "Neues Produkt" };

export default async function NewProductPage() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/studio/produkte/neu");
  const data = await loadEditor(user.id, null);
  if (!data?.initial) redirect("/studio/shop");
  if (data.shop.status === "SUSPENDED") redirect("/studio/shop");
  return (
    <div>
      <PageHeader kicker="Creator Studio · Produkte" title="Neues Produkt" description="Alles, was Käufer:innen wissen müssen – ehrlich, vollständig und mit dem Projekt dahinter." />
      <ProductEditor
        initial={data.initial}
        projects={data.links.projects}
        tutorials={data.links.tutorials}
        shopActive={data.shop.status === "ACTIVE"}
        shopReturnPolicy={data.shop.returnPolicy}
        feeBps={data.feeBps}
        digitalEnabled={data.digitalEnabled}
      />
    </div>
  );
}
