import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Aktuelle Version (Git-Commit des laufenden Deploys) – der Browser erkennt so neue Versionen. */
export function GET() {
  return NextResponse.json({ release: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null }, { headers: { "Cache-Control": "no-store" } });
}
