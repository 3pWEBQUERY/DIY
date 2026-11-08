import { api, body } from "@/server/api";
import { verifyMfaLogin } from "@/server/auth/mfa";

/**
 * Zweiter Anmeldeschritt für Token-Clients (iOS-App): mit dem Bearer-Token aus
 * POST /api/v1/auth/session aufrufen. `kind: "recovery"` für Wiederherstellungscodes.
 */
export const POST = api(async (req) => {
  const b = await body<{ code?: string; kind?: "totp" | "recovery" }>(req);
  return verifyMfaLogin(String(b.code ?? ""), b.kind === "recovery" ? "recovery" : "totp");
});
