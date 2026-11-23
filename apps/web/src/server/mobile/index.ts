import "server-only";
import type { RouteDef } from "./router";
import { identityRoutes } from "./routes/identity";
import { socialRoutes } from "./routes/social";
import { contentRoutes } from "./routes/content";
import { commerceRoutes } from "./routes/commerce";
import { communityRoutes } from "./routes/community";
import { studioAdminRoutes } from "./routes/studio-admin";
import { storyRoutes } from "./routes/stories";
import { supporterRoutes } from "./routes/supporters";
import { hashtagRoutes } from "./routes/hashtags";
import { newsletterRoutes } from "./routes/newsletter";

/**
 * Routentabelle der Mobile-API. Reihenfolge zählt: spezifische Pfade vor Platzhaltern
 * (z. B. `/shopping-lists/add-source` vor `/shopping-lists/:id`).
 */
export const mobileRoutes: RouteDef[] = [...identityRoutes, ...storyRoutes, ...socialRoutes, ...contentRoutes, ...commerceRoutes, ...communityRoutes, ...studioAdminRoutes, ...supporterRoutes, ...hashtagRoutes, ...newsletterRoutes];
