import "server-only";
import { clientIpHash } from "@/server/auth/session";
import { rateLimit } from "@/server/ratelimit";
import { appUrl } from "@/server/commerce/stripe";
import { z } from "zod";
import { ZS_DEFAULTS, decodeState, parsePartsText } from "@/lib/zuschnitt";
import { cuttingPlan } from "@/server/tools/cutting-plan";
import { fail } from "@/server/errors";
import { GET, POST, str, viewerId, type RouteDef } from "../router";

/** Werkzeuge (auch für Gäste): Zuschnittrechner mit derselben Berechnung wie im Web. */
export const toolRoutes: RouteDef[] = [
  GET("/tools/cutting-plan/defaults", async () => ({ settings: ZS_DEFAULTS })),
  POST("/tools/cutting-plan", async (c) => {
    const uid = await viewerId();
    await rateLimit(`tools-cutting:${uid ?? (await clientIpHash())}`, 120, 3600);
    return cuttingPlan(await c.json(), appUrl);
  }),
  /** „Liste einfügen“: gleiche Erkennung wie im Web (Name; Länge; Breite; Stück, Tab/Semikolon/Komma) */
  POST("/tools/cutting-plan/parse", async (c) => {
    const { text } = z.object({ text: z.string().max(20_000) }).parse(await c.json());
    return { parts: parsePartsText(text).slice(0, 200) };
  }),
  /** Geteilten Web-Link (/werkzeuge/zuschnitt#d=…) in der App öffnen */
  GET("/tools/cutting-plan/decode", async (c) => {
    const code = str(c.q, "code")?.slice(0, 20_000);
    const state = code ? decodeState(code) : null;
    if (!state) throw fail.invalid("Der Link enthält keinen gültigen Zuschnittplan.");
    return { parts: state.parts.slice(0, 200), settings: state.settings };
  }),
];
