import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { getShoppingList, listMyShoppingLists } from "@/server/materials/service";
import { Page } from "@/components/shell/page";
import { ShoppingListEditor } from "@/components/materials/shopping-list";

export const metadata: Metadata = { title: "Einkaufsliste", robots: { index: false } };

export default async function ShoppingListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/anmelden?weiter=/einkaufslisten/${id}`);
  const [list, all] = await Promise.all([getShoppingList(user, id), listMyShoppingLists(user.id)]);
  if (!list) notFound();
  return (
    <Page width="feed">
      <ShoppingListEditor key={list.updatedAt} list={list} otherLists={all.filter((l) => l.id !== id).map((l) => ({ id: l.id, title: l.title, total: l.total }))} />
    </Page>
  );
}
