import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryLayout } from "@werkraum/shared";

/** Datenbank und Sichtbarkeit nachgebildet: nur das, was die Layout-Prüfung abfragt. */
const state = {
  projects: [] as { id: string; ownerId: string; state: string }[],
  profiles: [] as { handle: string; userId: string; status: string }[],
  blocked: [] as string[],
  canView: new Set<string>(),
  notified: [] as Record<string, unknown>[],
  failFor: new Set<string>(),
};

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  db: {
    project: {
      findMany: async ({ where }: { where: { id: { in: string[] }; ownerId: string } }) =>
        state.projects.filter((p) => where.id.in.includes(p.id) && p.ownerId === where.ownerId && p.state !== "REMOVED").map((p) => ({ id: p.id })),
    },
    userProfile: {
      findMany: async ({ where }: { where: { handle: { in: string[] } } }) =>
        state.profiles.filter((p) => where.handle.in.includes(p.handle)).map((p) => ({ handle: p.handle, userId: p.userId, user: { status: p.status } })),
    },
  },
}));
vi.mock("@/server/visibility", () => ({
  relationsFor: async () => ({ blocked: state.blocked, muted: [], following: [], hidden: [] }),
  canViewContent: async (viewerId: string) => state.canView.has(viewerId),
}));
vi.mock("@/server/notifications", () => ({
  notify: async (n: Record<string, unknown>) => {
    if (state.failFor.has(n.recipientId as string)) throw new Error("Zustellung fehlgeschlagen");
    state.notified.push(n);
  },
}));

const { cleanLayout, prepareStoryLayout, mentionTargets, notifyStoryMentions, toLayoutView, STORY_MENTION_NOTIFY_MAX } = await import("../layout");

const base = { x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 };
const mention = (id: string, handle: string, extra: Record<string, unknown> = {}) => ({ ...base, id, type: "mention" as const, handle, color: "ink" as const, ...extra });
const project = (id: string, projectId: string) => ({ ...base, id, type: "projectLink" as const, projectId, color: "white" as const });
const text = (id: string) => ({ ...base, id, type: "text" as const, text: "Hallo", color: "white" as const, style: "bold" as const, align: "center" as const });

beforeEach(() => {
  state.projects = [
    { id: "own", ownerId: "author", state: "PUBLISHED" },
    { id: "draft", ownerId: "author", state: "DRAFT" },
    { id: "gone", ownerId: "author", state: "REMOVED" },
    { id: "foreign", ownerId: "other", state: "PUBLISHED" },
  ];
  state.profiles = [
    { handle: "lena.haekelt", userId: "u-lena", status: "ACTIVE" },
    { handle: "mira.strickt", userId: "u-mira", status: "SUSPENDED" },
    { handle: "gebannt", userId: "u-ban", status: "BANNED" },
    { handle: "blockiert", userId: "u-block", status: "ACTIVE" },
    { handle: "autorin", userId: "author", status: "ACTIVE" },
  ];
  state.blocked = ["u-block"];
  state.canView = new Set(["u-lena", "u-mira"]);
  state.notified = [];
  state.failFor = new Set();
});

describe("Layout beim Erstellen bereinigen", () => {
  it("Erwähnungen: unbekannt, gesperrt, blockiert und doppelt fallen weg; Konto-ID vom Server", async () => {
    const l: StoryLayout = {
      version: 1,
      elements: [
        mention("a", "lena.haekelt", { userId: "gefälscht" }),
        mention("b", "lena.haekelt"),
        mention("c", "unbekannt"),
        mention("d", "gebannt"),
        mention("e", "blockiert"),
        mention("f", "mira.strickt"),
        mention("g", "autorin"),
        text("t"),
      ],
    };
    const r = await prepareStoryLayout("author", "TEXT", l);
    expect(r?.elements.map((e) => e.id)).toEqual(["a", "f", "g", "t"]);
    expect(r?.elements[0]).toMatchObject({ handle: "lena.haekelt", userId: "u-lena" });
    expect(r?.elements[1]).toMatchObject({ userId: "u-mira" });
  });

  it("Projekt-Sticker nur auf eigene, nicht entfernte Projekte", async () => {
    const l: StoryLayout = { version: 1, elements: [project("a", "own"), project("b", "draft"), project("c", "gone"), project("d", "foreign"), project("e", "fehlt")] };
    const r = await prepareStoryLayout("author", "MEDIA", l);
    expect(r?.elements.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("Filter nur für Foto/Video, Textstil nur für Text-Stories; leer ergibt null", () => {
    const refs = { ownProjects: new Set<string>(), mentions: new Map<string, string>() };
    const l: StoryLayout = { version: 1, media: { filter: "mono", intensity: 80 }, text: { style: "caps", align: "left", scale: 1.2 }, elements: [] };
    expect(cleanLayout(l, "MEDIA", refs)).toEqual({ version: 1, media: { filter: "mono", intensity: 80 }, elements: [] });
    expect(cleanLayout(l, "TEXT", refs)).toEqual({ version: 1, text: { style: "caps", align: "left", scale: 1.2 }, elements: [] });
    expect(cleanLayout({ version: 1, elements: [mention("a", "x.y.z")] }, "TEXT", refs)).toBeNull();
    expect(cleanLayout({ version: 1, media: { filter: "original", intensity: 100 }, elements: [] }, "MEDIA", refs)).toBeNull();
  });

  it("ohne Layout bleibt es ohne", async () => {
    expect(await prepareStoryLayout("author", "TEXT", undefined)).toBeNull();
  });
});

describe("Erwähnte benachrichtigen", () => {
  const story = { id: "s1", authorId: "author", authorHandle: "autorin", visibility: "PUBLIC" };

  it("nur wer die Story sehen darf, nie die Autorin, je Person einmal", async () => {
    const l: StoryLayout = { version: 1, elements: [mention("a", "lena.haekelt", { userId: "u-lena" }), mention("b", "lena2", { userId: "u-lena" }), mention("c", "autorin", { userId: "author" }), mention("d", "x.y.z", { userId: "u-follower-only" })] };
    await notifyStoryMentions(story, l);
    expect(state.notified).toEqual([
      { recipientId: "u-lena", type: "MENTION", actorId: "author", targetType: "STORY", targetId: "s1", data: { href: "/stories/autorin?story=s1" }, bundle: false },
    ]);
  });

  it("höchstens zehn Personen; ein Fehler hält die anderen nicht auf", async () => {
    const ids = Array.from({ length: 14 }, (_, i) => `u${i}`);
    state.canView = new Set(ids);
    state.failFor = new Set(["u0"]);
    const l: StoryLayout = { version: 1, elements: ids.map((u, i) => mention(`m${i}`, `person.${i}`, { userId: u })) };
    expect(mentionTargets(l, "author")).toHaveLength(STORY_MENTION_NOTIFY_MAX);
    await expect(notifyStoryMentions(story, l)).resolves.toBeUndefined();
    expect(state.notified.map((n) => n.recipientId)).toEqual(ids.slice(1, STORY_MENTION_NOTIFY_MAX));
  });

  it("ohne Layout keine Benachrichtigung", async () => {
    await notifyStoryMentions(story, null);
    expect(state.notified).toEqual([]);
  });
});

describe("Layout für die Anzeige", () => {
  it("aktueller Benutzername, unsichtbare Konten und nicht öffentliche Projekte fallen weg", () => {
    const l: StoryLayout = {
      version: 1,
      elements: [mention("a", "alt.name", { userId: "u1" }), mention("b", "weg", { userId: "u2" }), mention("c", "ohne.id"), project("p", "pub"), project("q", "privat"), text("t")],
    };
    const users = new Map([["u1", { handle: "neu.name", visible: true }], ["u2", { handle: "weg", visible: false }]]);
    const projects = new Map([["pub", { title: "Korb", href: "/u/lena/korb" }]]);
    const v = toLayoutView(l, users, projects);
    expect(v?.elements.map((e) => e.id)).toEqual(["a", "p", "t"]);
    expect(v?.elements[0]).toMatchObject({ handle: "neu.name" });
    expect(v?.elements[1]).toMatchObject({ project: { title: "Korb", href: "/u/lena/korb" } });
    expect(toLayoutView(null, users, projects)).toBeNull();
  });
});

describe("Benachrichtigungstext für Erwähnungen in Stories", async () => {
  const { notificationText, notificationHref } = await import("@/server/notifications-format");
  it("nennt die Story und führt zu ihr", () => {
    const n = { type: "MENTION", count: 1, targetType: "STORY", data: { href: "/stories/autorin?story=s1" }, actor: { profile: { displayName: "Anna" } } };
    expect(notificationText(n)).toBe("Anna hat dich in einer Story erwähnt.");
    expect(notificationHref(n)).toBe("/stories/autorin?story=s1");
    // Beiträge unverändert
    expect(notificationText({ ...n, targetType: "POST", data: {} })).toBe("Anna hat dich erwähnt.");
  });
});
