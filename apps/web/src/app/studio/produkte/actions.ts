"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as products from "@/server/commerce/products";

export async function saveProductAction(productId: string | null, input: unknown, extra: unknown) {
  return act(async () => {
    const r = await products.upsertProduct(await requireUser(), productId, input, extra);
    revalidatePath("/studio/produkte");
    revalidatePath(`/markt/${r.shopSlug}`);
    revalidatePath(`/markt/${r.shopSlug}/${r.slug}`);
    return r;
  });
}

export async function setProductStatusAction(productId: string, status: "ACTIVE" | "PAUSED" | "DRAFT") {
  return act(async () => {
    const p = await products.setProductStatus(await requireUser(), productId, status);
    revalidatePath("/studio/produkte");
    return { status: p.status };
  }, status === "ACTIVE" ? "Veröffentlicht." : status === "PAUSED" ? "Pausiert – das Produkt ist nicht mehr sichtbar." : "Als Entwurf gespeichert.");
}

export async function deleteProductAction(productId: string) {
  return act(async () => {
    await products.deleteProduct(await requireUser(), productId);
    revalidatePath("/studio/produkte");
    return null;
  }, "Produkt gelöscht.");
}
