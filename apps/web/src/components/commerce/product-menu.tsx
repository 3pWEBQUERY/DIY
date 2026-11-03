"use client";

import { MoreMenu, useSafetyMenu } from "@/components/social/actions";

/** Melden / Ausblenden / Stummschalten / Blockieren für fremde Produkte (§24.1). */
export function ProductSafetyMenu({ productId, sellerId, sellerName }: { productId: string; sellerId: string; sellerName: string }) {
  const { items, dialog } = useSafetyMenu({ targetType: "PRODUCT", targetId: productId, authorId: sellerId, authorName: sellerName });
  return (
    <>
      <MoreMenu items={items} label="Weitere Aktionen zum Produkt" />
      {dialog}
    </>
  );
}
