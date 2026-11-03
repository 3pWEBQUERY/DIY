"use server";

import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { checkAuditIntegrity } from "@/server/admin/system";

export async function verifyAuditAction() {
  return act(async () => {
    const u = await requireRole("ADMIN");
    return checkAuditIntegrity(u);
  });
}
