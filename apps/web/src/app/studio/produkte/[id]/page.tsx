import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PRODUCT_STATUS_LABEL } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { PageHeader } from "@/components/shell/page";
import { ProductEditor } from "@/components/commerce/product-editor";
import { Badge } from "@/components/ui/misc";
import { loadEditor } from "../editor-data";

export const metadata: Metadata = { title: "Produkt bearbeiten" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, currentUser()]);
  if (!user) redirect(`/anmelden?weiter=/studio/produkte/${id}`);
  const data = await loadEditor(user.id, id);
  if (!data) redirect("/studio/shop");
  if (!data.initial) notFound();
  const visible = data.initial.status === "ACTIVE" || data.initial.status === "SOLD_OUT";
  return (
    <div>
      <PageHeader
        kicker="Creator Studio · Produkte"
        title={data.initial.title || "Produkt"}
        actions={
          <>
            <Badge tone={data.initial.status === "ACTIVE" ? "moss" : data.initial.status === "DISABLED" ? "danger" : "neutral"}>{PRODUCT_STATUS_LABEL[data.initial.status]}</Badge>
            {data.slug && (
              <Link href={`/markt/${data.shop.slug}/${data.slug}`} className="text-[13.5px] font-semibold underline underline-offset-2">
                {visible ? "Im Marktplatz ansehen" : "Vorschau"}
              </Link>
            )}
          </>
        }
      />
      <ProductEditor
        key={data.initial.id ?? "neu"}
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
