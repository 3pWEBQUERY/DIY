import "server-only";
import * as hashtags from "@/server/hashtags/service";
import { rateLimit } from "@/server/ratelimit";
import { GET, need, str, viewerId, type RouteDef } from "../router";

/**
 * Hashtags in der App: Vorschläge beim Tippen, beliebte Hashtags und die Hashtag-Seite.
 * Inhalte in derselben Form wie Feed (Beiträge), Projekt-, Anleitungs-, Artikel- und Produktlisten.
 * Reihenfolge: feste Pfade vor `/hashtags/:name`.
 */
export const hashtagRoutes: RouteDef[] = [
  GET("/hashtags/suggest", async (c) => {
    const vid = await viewerId();
    await rateLimit(`hashtag-suggest:${vid ?? "anon"}`, 120, 60);
    return { items: await hashtags.suggestHashtags((str(c.q, "q") ?? "").slice(0, 60), 8) };
  }),
  GET("/hashtags/trending", async () => ({ items: await hashtags.trendingHashtags(16) })),
  GET("/hashtags/:name", async (c) => {
    const kind = hashtags.hashtagKindFromSlug(str(c.q, "typ") ?? str(c.q, "type"));
    const page = await hashtags.getHashtagPage(c.p.name!, { kind, viewerId: await viewerId(), cursor: str(c.q, "cursor") ?? null });
    return need(page, "Hashtag nicht gefunden.");
  }),
];
