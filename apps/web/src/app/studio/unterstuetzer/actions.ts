"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { saveSupportPlan } from "@/server/supporters/service";

export async function saveSupportPlanAction(input: unknown) {
  return act(async () => {
    const r = await saveSupportPlan(await requireUser(), input);
    revalidatePath("/studio/unterstuetzer");
    return r;
  }, "Unterstützer-Abo gespeichert.");
}
