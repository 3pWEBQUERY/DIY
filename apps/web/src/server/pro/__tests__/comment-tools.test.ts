import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_THEME, PROFILE_ACCENTS, commentFilterWordsSchema, contrastRatio, matchCommentFilter, parseProfileTheme, profileThemeSchema } from "@werkraum/shared";

const proState = { pro: false };
const comment = { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() };
const queryRaw = vi.fn();
const userProfile = { findUnique: vi.fn(), update: vi.fn() };
vi.mock("@/server/db", () => ({
  db: { comment, userProfile, $queryRaw: (...a: unknown[]) => queryRaw(...a), $transaction: vi.fn(async (x: unknown) => (Array.isArray(x) ? x : (x as (tx: unknown) => unknown)({ comment }))) },
  Prisma: { DbNull: null },
}));
vi.mock("../service", () => ({ isPro: vi.fn(async () => proState.pro) }));
vi.mock("@/server/social/targets", () => ({ targetMeta: vi.fn(async () => ({ ownerId: "owner", title: "Korb", href: "/x", state: "PUBLISHED", visibility: "PUBLIC" })), bumpCounter: vi.fn() }));

const tools = await import("../comment-tools");
const theme = await import("../profile-theme");

describe("Wortfilter", () => {
  const words = commentFilterWordsSchema.parse(["Mist", " GRATIS Versand ", "ass", "mist", "x"]);

  it("normalisiert, entfernt Doppelte und zu Kurzes", () => {
    expect(words).toEqual(["mist", "gratis versand", "ass"]);
  });

  it("trifft ohne Gross-/Kleinschreibung und Umlaute, lange Wörter auch als Wortteil", () => {
    expect(matchCommentFilter("So ein MISTKERL!", words)).toBe("mist");
    expect(matchCommentFilter("Jetzt gratis   Versand bestellen", words)).toBe("gratis versand");
    expect(matchCommentFilter("Grüsse aus Zürich", ["grusse"])).toBe("grusse");
  });

  it("kurze Wörter nur als ganzes Wort", () => {
    expect(matchCommentFilter("Klasse gemacht", words)).toBeNull();
    expect(matchCommentFilter("du ass", words)).toBe("ass");
  });

  it("begrenzt die Liste", () => {
    expect(commentFilterWordsSchema.safeParse(Array.from({ length: 101 }, (_, i) => `wort${i}`)).success).toBe(false);
  });
});

describe("Profil-Design", () => {
  it("prüft Farbe, Layout und Bereiche", () => {
    expect(profileThemeSchema.safeParse({ accent: "moos", coverLayout: "framed", sections: ["shop", "projects"] }).success).toBe(true);
    expect(profileThemeSchema.safeParse({ accent: "neon", coverLayout: "wide", sections: ["projects"] }).success).toBe(false);
    expect(profileThemeSchema.safeParse({ accent: "moos", coverLayout: "wide", sections: [] }).success).toBe(false);
    expect(profileThemeSchema.safeParse({ accent: "moos", coverLayout: "wide", sections: ["posts", "posts"] }).success).toBe(false);
    expect(parseProfileTheme({ accent: "?" })).toBeNull();
    expect(DEFAULT_PROFILE_THEME.sections).toHaveLength(5);
  });

  it("alle Akzentfarben erreichen WCAG AA (Text auf Papier, weisser Text auf der Farbe)", () => {
    for (const a of Object.values(PROFILE_ACCENTS)) {
      expect(contrastRatio(a.base, "#faf8f5")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(a.ink, "#faf8f5")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio("#ffffff", a.base)).toBeGreaterThanOrEqual(4.5);
      // Dunkelmodus (iOS): Akzent auf dunklem Grund
      expect(contrastRatio(a.dark, "#1b1917")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("speichern nur mit Pro; Zurücksetzen immer", async () => {
    proState.pro = false;
    await expect(theme.saveProfileTheme({ id: "owner" }, { accent: "moos", coverLayout: "wide", sections: ["projects"] })).rejects.toThrow(/Creator Pro/);
    await expect(theme.saveProfileTheme({ id: "owner" }, null)).resolves.toMatchObject({ custom: false });
    proState.pro = true;
    await expect(theme.saveProfileTheme({ id: "owner" }, { accent: "neon", coverLayout: "wide", sections: ["projects"] })).rejects.toThrow();
    await expect(theme.saveProfileTheme({ id: "owner" }, { accent: "moos", coverLayout: "wide", sections: ["projects"] })).resolves.toMatchObject({ custom: true });
  });

  it("wirkt nur mit aktivem Pro", async () => {
    userProfile.findUnique.mockResolvedValue({ profileTheme: { accent: "tinte", coverLayout: "none", sections: ["posts"] } });
    expect(await theme.effectiveProfileTheme("owner", false)).toBeNull();
    expect(await theme.effectiveProfileTheme("owner", true)).toMatchObject({ accent: "tinte" });
    expect(theme.themeStyle({ accent: "tinte", coverLayout: "wide", sections: ["posts"] })).toMatchObject({ "--color-moss": "#2f5d84" });
    expect(theme.themeStyle(null)).toBeUndefined();
  });
});

describe("Kommentar-Werkzeuge: Berechtigungen", () => {
  beforeEach(() => {
    comment.findUnique.mockResolvedValue({ id: "c1", targetType: "PROJECT", targetId: "p1", parentId: null, state: "PUBLISHED", pinnedAt: null, filteredAt: null });
    comment.update.mockReset();
  });

  it("nur Inhaber:innen heften an – und nur mit Pro", async () => {
    proState.pro = true;
    await expect(tools.setCommentPinned({ id: "fremd" }, "c1", true)).rejects.toThrow(/eigenen Inhalten/);
    proState.pro = false;
    await expect(tools.setCommentPinned({ id: "owner" }, "c1", true)).rejects.toThrow(/Creator Pro/);
    // Lösen geht auch ohne Pro
    await expect(tools.setCommentPinned({ id: "owner" }, "c1", false)).resolves.toEqual({ pinned: false });
    proState.pro = true;
    await expect(tools.setCommentPinned({ id: "owner" }, "c1", true)).resolves.toEqual({ pinned: true });
  });

  it("Antworten und ausgeblendete Kommentare lassen sich nicht anheften", async () => {
    proState.pro = true;
    comment.findUnique.mockResolvedValueOnce({ id: "c2", targetType: "PROJECT", targetId: "p1", parentId: "c1", state: "PUBLISHED", pinnedAt: null, filteredAt: null });
    await expect(tools.setCommentPinned({ id: "owner" }, "c2", true)).rejects.toThrow(/Hauptkommentare/);
    comment.findUnique.mockResolvedValueOnce({ id: "c3", targetType: "PROJECT", targetId: "p1", parentId: null, state: "PUBLISHED", pinnedAt: null, filteredAt: new Date() });
    await expect(tools.setCommentPinned({ id: "owner" }, "c3", true)).rejects.toThrow(/Blende den Kommentar/);
  });

  it("Wortfilter speichern nur mit Pro; eigene Kommentare nie filtern", async () => {
    proState.pro = false;
    await expect(tools.setCommentFilter({ id: "owner" }, { words: ["mist"] })).rejects.toThrow(/Creator Pro/);
    proState.pro = true;
    userProfile.findUnique.mockResolvedValue({ commentFilterWords: ["mist"] });
    expect(await tools.shouldFilterComment("owner", "gast", "So ein Mist")).toBe(true);
    expect(await tools.shouldFilterComment("owner", "owner", "So ein Mist")).toBe(false);
    proState.pro = false;
    expect(await tools.shouldFilterComment("owner", "gast", "So ein Mist")).toBe(false);
  });

  it("Schliessen nur bei Beiträgen, Projekten und Anleitungen", async () => {
    proState.pro = true;
    await expect(tools.setCommentsLocked({ id: "owner" }, "ARTICLE", "a1", true)).rejects.toThrow(/nicht schliessen/);
    await expect(tools.setCommentsLocked({ id: "fremd" }, "PROJECT", "p1", true)).rejects.toThrow(/eigenen Inhalten/);
  });
});

describe("Wortfilter rückwirkend", () => {
  const rows = [
    { id: "r1", body: "Antwort mit Mist", parentId: "t1", targetType: "POST", targetId: "p1" },
    { id: "t1", body: "So ein Mist", parentId: null, targetType: "POST", targetId: "p1" },
    { id: "t2", body: "Schöne Arbeit", parentId: null, targetType: "POST", targetId: "p1" },
    { id: "r2", body: "GRATIS versand hier", parentId: "t2", targetType: "PROJECT", targetId: "pr1" },
  ];
  beforeEach(async () => {
    proState.pro = true;
    queryRaw.mockReset().mockResolvedValue(rows);
    comment.updateMany.mockReset().mockResolvedValue({ count: 1 });
    comment.count.mockReset();
    comment.findUnique.mockReset();
    userProfile.findUnique.mockReset().mockResolvedValue({ commentFilterWords: ["mist", "gratis versand"] });
    const { bumpCounter } = await import("@/server/social/targets");
    (bumpCounter as ReturnType<typeof vi.fn>).mockClear();
  });

  it("zählt nur, ohne etwas zu ändern (Rückfrage)", async () => {
    const r = await tools.applyCommentFilterToExisting({ id: "owner" }, { dryRun: true });
    expect(r).toMatchObject({ matched: 3, hidden: 0, scanned: 4, limited: false });
    expect(comment.updateMany).not.toHaveBeenCalled();
  });

  it("blendet Treffer aus – Hauptkommentare zuerst, Zähler wie beim Löschen", async () => {
    const { bumpCounter } = await import("@/server/social/targets");
    // t1 hat zwei sichtbare Antworten (darunter r1) → −3; r1 danach unter ausgeblendetem t1 → 0; r2 unter sichtbarem t2 → −1
    comment.count.mockResolvedValue(2);
    comment.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "t1" ? { state: "PUBLISHED", filteredAt: new Date() } : { state: "PUBLISHED", filteredAt: null }));
    const r = await tools.applyCommentFilterToExisting({ id: "owner" }, { dryRun: false });
    expect(r.hidden).toBe(3);
    expect(comment.updateMany.mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id)).toEqual(["t1", "r1", "r2"]);
    const calls = (bumpCounter as ReturnType<typeof vi.fn>).mock.calls.map((c) => [c[1], c[2], c[4]]);
    expect(calls).toEqual([
      ["POST", "p1", -3],
      ["PROJECT", "pr1", -1],
    ]);
  });

  it("nur mit Creator Pro und gespeicherter Wortliste", async () => {
    userProfile.findUnique.mockResolvedValue({ commentFilterWords: [] });
    expect(await tools.applyCommentFilterToExisting({ id: "owner" }, { dryRun: false })).toMatchObject({ matched: 0, hidden: 0 });
    expect(queryRaw).not.toHaveBeenCalled();
    proState.pro = false;
    await expect(tools.applyCommentFilterToExisting({ id: "owner" }, { dryRun: true })).rejects.toThrow(/Creator Pro/);
  });
});
