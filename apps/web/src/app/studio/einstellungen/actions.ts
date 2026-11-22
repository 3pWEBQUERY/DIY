"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { clearPdfBrand, savePdfBrand } from "@/server/pro/pdf-brand";

/** PDF-Branding der eigenen Anleitungen (Creator Pro) */
export async function savePdfBrandAction(input: unknown) {
  return act(async () => {
    const r = await savePdfBrand(await requireUser(), input);
    revalidatePath("/studio/einstellungen");
    return r;
  }, "PDF-Branding gespeichert.");
}

export async function clearPdfBrandAction() {
  return act(async () => {
    const r = await clearPdfBrand(await requireUser());
    revalidatePath("/studio/einstellungen");
    return r;
  }, "Standard-Druckfassung wiederhergestellt.");
}
