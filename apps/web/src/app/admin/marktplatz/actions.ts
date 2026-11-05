"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { decideShop, type ShopDecision } from "@/server/admin/content";
import {
  decideProduct,
  rejectShopVerificationAdmin,
  setProductFeaturedAdmin,
  setReviewHiddenAdmin,
  updateProductAdmin,
  updateShopAdmin,
  type ProductDecision,
} from "@/server/admin/shops";

type ReasonInput = { reason: string; publicNote?: string; days?: number | null; choice?: string };

/** Liste, Shop- und Produktdetail liegen alle unter /admin/marktplatz. */
const refresh = () => {
  revalidatePath("/admin/marktplatz");
  revalidatePath("/admin/marktplatz/[id]", "page");
  revalidatePath("/admin/marktplatz/produkte/[id]", "page");
};

export async function decideShopAction(shopId: string, decision: ShopDecision, input: { reason: string }) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await decideShop(u, shopId, decision, input.reason);
    refresh();
    return null;
  }, "Shopstatus aktualisiert.");
}

export async function rejectShopVerificationAction(shopId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await rejectShopVerificationAdmin(u, shopId, { reason: input.reason, publicNote: input.publicNote });
    refresh();
    return null;
  }, "Antrag abgelehnt – der Shop ist wieder im Entwurf.");
}

export async function updateShopAction(shopId: string, input: Record<string, unknown>) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const r = await updateShopAdmin(u, shopId, input);
    refresh();
    return r;
  }, "Shopangaben gespeichert.");
}

export async function updateProductAction(productId: string, input: Record<string, unknown>) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const r = await updateProductAdmin(u, productId, input);
    refresh();
    return r;
  }, "Angebot gespeichert.");
}

export async function decideProductAction(productId: string, decision: ProductDecision, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole(decision === "RESTORE" ? "ADMIN" : "PLATFORM_MODERATOR");
    const r = await decideProduct(u, productId, decision, { reason: input.reason, publicNote: input.publicNote });
    refresh();
    return r;
  }, "Produktstatus aktualisiert.");
}

export async function setProductFeaturedAction(productId: string, featured: boolean) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setProductFeaturedAdmin(u, productId, featured);
    refresh();
    return null;
  }, featured ? "Produkt hervorgehoben." : "Hervorhebung entfernt.");
}

export async function setReviewHiddenAction(reviewId: string, hidden: boolean, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setReviewHiddenAdmin(u, reviewId, hidden, { reason: input.reason, publicNote: input.publicNote });
    refresh();
    return null;
  }, hidden ? "Bewertung ausgeblendet." : "Bewertung wieder sichtbar.");
}
