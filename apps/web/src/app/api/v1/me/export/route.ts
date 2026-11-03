import { api } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { exportUserData } from "@/server/identity/service";
import { rateLimit } from "@/server/ratelimit";
import { audit } from "@/server/audit";

/** GET /api/v1/me/export – Datenauskunft als JSON-Download (§23.1, revDSG Art. 25 / DSGVO Art. 15 & 20). */
export const GET = api(async () => {
  const user = await requireUser({ allowSuspended: true });
  await rateLimit(`export:${user.id}`, 5, 3600);
  const data = await exportUserData(user.id);
  await audit({ actorId: user.id, action: "account.data_exported", targetType: "USER", targetId: user.id });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="werkraum-daten-${date}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
