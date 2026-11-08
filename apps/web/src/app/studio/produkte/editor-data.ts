import "server-only";
import { getSetting } from "@/server/settings";
import { getMyShop } from "@/server/commerce/shops";
import { getProductForEdit, linkOptions } from "@/server/commerce/products";
import { minorToInput } from "@/server/commerce/rules";
import type { ProductEditorInitial } from "@/components/commerce/product-editor";

/** Lädt alles, was der Produkteditor braucht (neu oder bestehend). */
export async function loadEditor(userId: string, productId: string | null) {
  const [shop, links, feeBps, digitalEnabled] = await Promise.all([getMyShop(userId), linkOptions(userId), getSetting("commerce.feeBps"), getSetting("commerce.digitalEnabledWeb")]);
  if (!shop) return null;
  let slug: string | null = null;
  let initial: ProductEditorInitial = {
    id: null,
    title: "",
    description: "",
    kind: "UNIQUE",
    category: "haekeln-stricken",
    priceMinor: 0,
    stock: 1,
    reserved: 0,
    materialList: [],
    dimensions: "",
    heightMm: null,
    widthMm: null,
    depthMm: null,
    productionDays: shop.processingDays,
    shippingMinor: 900,
    shipsFrom: shop.country,
    safetyInfo: "",
    returnPolicy: "",
    projectId: "",
    tutorialId: "",
    status: "DRAFT",
    media: [],
    variants: [],
    digital: null,
    publishedAt: null,
  };
  if (productId) {
    const p = await getProductForEdit({ id: userId }, productId);
    if (!p) return { shop, links, feeBps, digitalEnabled, initial: null, slug };
    slug = p.slug;
    const base = p.inventory.find((i) => i.variantId === null);
    initial = {
      id: p.id,
      title: p.title,
      description: p.description,
      kind: p.kind,
      category: p.category,
      priceMinor: p.priceMinor,
      stock: base?.onHand ?? 0,
      reserved: base?.reserved ?? 0,
      materialList: p.materialList.length ? p.materialList : p.materials ? [p.materials] : [],
      dimensions: p.dimensions,
      heightMm: p.heightMm,
      widthMm: p.widthMm,
      depthMm: p.depthMm,
      productionDays: p.productionDays,
      shippingMinor: p.shippingMinor,
      shipsFrom: p.shipsFrom,
      safetyInfo: p.safetyInfo,
      returnPolicy: p.returnPolicy,
      projectId: p.projectId ?? "",
      tutorialId: p.tutorialId ?? "",
      status: p.status,
      media: p.media.map((m) => {
        const v = (m.media.variants ?? {}) as Record<string, string>;
        return { id: m.mediaId, alt: m.alt, preview: v.sm ?? v.md ?? v.thumb ?? "", state: m.media.state === "FAILED" ? "error" : "ready", progress: 1, kind: m.media.kind };
      }),
      variants: p.variants.map((v) => ({ name: v.name, priceDelta: minorToInput(v.priceDeltaMinor), stock: v.inventory?.onHand ?? 0, reserved: v.inventory?.reserved ?? 0 })),
      digital: p.digitalFile
        ? { mediaId: p.digitalFile.id, label: `${p.digitalFile.mime === "application/zip" ? "ZIP" : "PDF"} · ${(p.digitalFile.bytes / 1024 / 1024).toFixed(1)} MB`, state: p.digitalFile.state }
        : null,
      publishedAt: p.publishedAt?.toISOString() ?? null,
    };
  }
  return { shop, links, feeBps, digitalEnabled, initial, slug };
}
