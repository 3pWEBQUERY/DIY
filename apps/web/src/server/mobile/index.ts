import "server-only";
import type { RouteDef } from "./router";
import { identityRoutes } from "./routes/identity";
import { socialRoutes } from "./routes/social";
import { contentRoutes } from "./routes/content";
import { commerceRoutes } from "./routes/commerce";
import { communityRoutes } from "./routes/community";
import { studioAdminRoutes } from "./routes/studio-admin";

/**
 * Routentabelle der Mobile-API. Reihenfolge zählt: spezifische Pfade vor Platzhaltern
 * (z. B. `/shopping-lists/add-source` vor `/shopping-lists/:id`).
 */
export const mobileRoutes: RouteDef[] = [...identityRoutes, ...socialRoutes, ...contentRoutes, ...commerceRoutes, ...communityRoutes, ...studioAdminRoutes];
