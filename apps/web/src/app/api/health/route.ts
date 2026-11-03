import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { features } from "@/server/env";

export const dynamic = "force-dynamic";

/** Healthcheck für Railway (§29.2 Monitoring). */
export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "ok",
      latencyMs: Date.now() - started,
      storage: features.storage() ? "s3" : "local",
      payments: features.payments(),
      version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    });
  } catch {
    return NextResponse.json({ status: "degraded", db: "error" }, { status: 503 });
  }
}
