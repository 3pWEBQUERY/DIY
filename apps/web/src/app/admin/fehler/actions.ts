"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { setErrorState } from "@/server/admin/errors";

export async function setErrorStateAction(id: string, state: "resolve" | "reopen" | "ignore") {
  return act(
    async () => {
      const u = await requireRole("ADMIN");
      await setErrorState(u, id, state);
      revalidatePath("/admin/fehler");
      revalidatePath(`/admin/fehler/${id}`);
      return null;
    },
    state === "resolve" ? "Als erledigt markiert. Tritt der Fehler erneut auf, wird er wieder geöffnet." : state === "ignore" ? "Fehler wird ignoriert – keine Meldungen mehr." : "Wieder geöffnet.",
  );
}
