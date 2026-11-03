import { NextResponse, type NextRequest } from "next/server";
import { api } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { resolveDownload } from "@/server/commerce/downloads";

export const dynamic = "force-dynamic";

/** Geschützter Download eines digitalen Produkts → Weiterleitung auf eine 5-Minuten-URL (§13.7). */
export const GET = api(async (req: NextRequest, ctx: { params: Promise<{ entitlementId: string }> }) => {
  const user = await requireUser();
  const { entitlementId } = await ctx.params;
  const url = await resolveDownload(user.id, entitlementId);
  const res = NextResponse.redirect(new URL(url, req.nextUrl.origin), 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
});
