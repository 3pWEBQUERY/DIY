import type { NextRequest } from "next/server";
import { dispatch } from "@/server/mobile/router";
import { mobileRoutes } from "@/server/mobile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ path: string[] }> };

/** Einstiegspunkt der Mobile-API für die native iOS-App: /api/v1/app/* (siehe src/server/mobile). */
async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return dispatch(mobileRoutes, req, path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
