import "server-only";
import { z } from "zod";
import * as stories from "@/server/stories/service";
import * as highlights from "@/server/stories/highlights";
import { mentionSuggestions } from "@/server/stories/layout";
import { DELETE, GET, PATCH, POST, me, need, str, viewer, viewerId, zId, type RouteDef } from "../router";

/**
 * Stories & Highlights (Feed-Story-Kreis, Betrachter, Erstellen, Archiv).
 * Reihenfolge: feste Pfade (`/stories/tray`, `/highlights/mine`) vor Platzhaltern.
 */
export const storyRoutes: RouteDef[] = [
  GET("/stories/tray", async () => stories.storyTray(await viewer())),
  GET("/stories/archive", async (c) => stories.storyArchive(await me(), str(c.q, "cursor") ?? null)),
  /** Story-Editor: Personen für den @Erwähnung-Sticker */
  GET("/stories/mention-suggest", async (c) => ({ items: await mentionSuggestions(await me(), str(c.q, "q") ?? "") })),
  /** Betrachter öffnen: Reihenfolge der Personen ab `handle` und die erste Gruppe. */
  GET("/stories/viewer/:handle", async (c) => {
    const u = await viewer();
    const [sequence, group] = await Promise.all([stories.storySequence(u, c.p.handle!), stories.storyGroup(u?.id ?? null, c.p.handle!, { focusId: str(c.q, "story") ?? null })]);
    return { sequence, group: need(group, "Keine aktiven Stories.") };
  }),
  GET("/stories/u/:handle", async (c) => need(await stories.storyGroup(await viewerId(), c.p.handle!, { focusId: str(c.q, "story") ?? null }), "Keine aktiven Stories.")),
  POST("/stories", async (c) => stories.createStory(await me(), await c.json())),
  POST("/stories/:id/seen", async (c) => stories.markStorySeen(await me(), c.p.id!)),
  POST("/stories/:id/like", async (c) => {
    const b = await c.body({ liked: z.boolean() });
    return stories.setStoryLike(await me(), c.p.id!, b.liked);
  }),
  POST("/stories/:id/reply", async (c) => stories.replyToStory(await me(), c.p.id!, await c.json())),
  GET("/stories/:id/viewers", async (c) => stories.storyViewers(await me(), c.p.id!)),
  DELETE("/stories/:id", async (c) => {
    await stories.deleteStory(await me(), c.p.id!);
    return { ok: true };
  }),
  POST("/users/:id/story-mute", async (c) => {
    const b = await c.body({ muted: z.boolean() });
    return stories.setStoryMute(await me(), c.p.id!, b.muted);
  }),
  GET("/me/story-mutes", async () => stories.listStoryMutes((await me()).id)),

  // ── Highlights ──
  GET("/highlights/mine", async (c) => highlights.myHighlights(await me(), str(c.q, "storyId") ?? null)),
  POST("/highlights/add", async (c) => {
    const b = await c.body({ storyId: zId, highlightId: zId.nullable().optional(), title: z.string().max(200).nullable().optional() });
    return highlights.addToHighlight(await me(), b);
  }),
  GET("/highlights/:id", async (c) => need(await highlights.highlightGroup(await viewerId(), c.p.id!), "Highlight nicht gefunden.")),
  POST("/highlights", async (c) => highlights.createHighlight(await me(), await c.json())),
  PATCH("/highlights/:id", async (c) => {
    await highlights.updateHighlight(await me(), c.p.id!, await c.json());
    return { ok: true };
  }),
  DELETE("/highlights/:id", async (c) => {
    await highlights.deleteHighlight(await me(), c.p.id!);
    return { ok: true };
  }),
  DELETE("/highlights/:id/stories/:storyId", async (c) => highlights.removeFromHighlight(await me(), c.p.id!, c.p.storyId!)),
];
