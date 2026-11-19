import { describe, expect, it } from "vitest";
import { announcementSchema, announcementStatus, isAllowedAnnouncementHref, isAnnouncementLive, isSingleEmoji } from "@werkraum/shared";
import { EMOJI_GROUPS, emojiName, searchEmoji } from "./emoji-data";

const base = { title: "Wartung am Sonntag", placements: ["feed"] };

describe("announcementSchema", () => {
  it("setzt sinnvolle Standardwerte (Entwurf, schliessbar, Koralle)", () => {
    const a = announcementSchema.parse(base);
    expect(a).toMatchObject({ body: "", emoji: "", tone: "coral", isActive: false, dismissible: true, position: 0, startsAt: null, endsAt: null });
  });

  it("verlangt Titel und mindestens eine Seite", () => {
    expect(announcementSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, placements: [] }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, placements: ["feed", "feed"] }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, placements: ["profil"] }).success).toBe(false);
  });

  it("lässt nur Farben der Palette zu", () => {
    expect(announcementSchema.safeParse({ ...base, tone: "sage" }).success).toBe(true);
    expect(announcementSchema.safeParse({ ...base, tone: "#ff00ff" }).success).toBe(false);
  });

  it("Button braucht Beschriftung und Link zusammen", () => {
    expect(announcementSchema.safeParse({ ...base, ctaLabel: "Mehr" }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, ctaHref: "/markt" }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, ctaLabel: "Mehr", ctaHref: "/markt" }).success).toBe(true);
  });

  it("weist gefährliche oder fremde Link-Schemata ab", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "http://werkuno.ch", "/ mit leerzeichen"]) {
      expect(isAllowedAnnouncementHref(href), href).toBe(false);
      expect(announcementSchema.safeParse({ ...base, ctaLabel: "Los", ctaHref: href }).success, href).toBe(false);
    }
    for (const href of ["/markt", "/entdecken?tab=neu", "https://werkuno.ch/hilfe"]) expect(isAllowedAnnouncementHref(href), href).toBe(true);
  });

  it("prüft den Zeitraum", () => {
    const ok = announcementSchema.parse({ ...base, startsAt: "2026-12-01T08:00:00.000Z", endsAt: "2026-12-02T08:00:00.000Z" });
    expect(ok.startsAt).toBeInstanceOf(Date);
    expect(announcementSchema.safeParse({ ...base, startsAt: "2026-12-02T08:00:00.000Z", endsAt: "2026-12-01T08:00:00.000Z" }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, startsAt: "kein datum" }).success).toBe(false);
    expect(announcementSchema.parse({ ...base, startsAt: "", endsAt: null }).startsAt).toBeNull();
  });

  it("nimmt genau ein Emoji als Symbol, keinen Text", () => {
    for (const e of ["🎉", "❤️", "👍🏽", "👩‍🔧", "🇨🇭", "🧶"]) expect(isSingleEmoji(e), e).toBe(true);
    for (const e of ["", "ab", "🎉 Party", "<b>", "1"]) expect(isSingleEmoji(e), e).toBe(false);
    expect(announcementSchema.safeParse({ ...base, emoji: "Hallo" }).success).toBe(false);
  });

  it("lehnt unbekannte Felder ab", () => {
    expect(announcementSchema.safeParse({ ...base, createdById: "x" }).success).toBe(false);
  });
});

describe("Status", () => {
  const now = new Date("2026-12-01T12:00:00Z");
  const at = (h: number) => new Date(now.getTime() + h * 3600_000);
  it("unterscheidet Entwurf, geplant, sichtbar, abgelaufen", () => {
    expect(announcementStatus({ isActive: false, startsAt: null, endsAt: null }, now)).toBe("draft");
    expect(announcementStatus({ isActive: true, startsAt: at(2), endsAt: null }, now)).toBe("scheduled");
    expect(announcementStatus({ isActive: true, startsAt: at(-2), endsAt: at(2) }, now)).toBe("live");
    expect(announcementStatus({ isActive: true, startsAt: null, endsAt: at(-1) }, now)).toBe("ended");
  });
  it("ist am Endzeitpunkt nicht mehr sichtbar", () => {
    expect(isAnnouncementLive({ isActive: true, startsAt: null, endsAt: now }, now)).toBe(false);
    expect(isAnnouncementLive({ isActive: true, startsAt: now, endsAt: null }, now)).toBe(true);
  });
});

describe("Emoji-Suche", () => {
  it("findet über deutsche Stichwörter, auch ohne Umlaute", () => {
    expect(searchEmoji("herz")).toContain("❤️");
    expect(searchEmoji("schweiz")).toContain("🇨🇭");
    expect(searchEmoji("gruen").length).toBeGreaterThan(0);
    expect(searchEmoji("   ")).toEqual([]);
  });
  it("hat nur gültige Emojis ohne Doppelte je Kategorie", () => {
    for (const g of EMOJI_GROUPS) {
      const list = g.items.map(([e]) => e);
      expect(new Set(list).size, g.id).toBe(list.length);
      for (const e of list) expect(isSingleEmoji(e), `${g.id}: ${e}`).toBe(true);
    }
    expect(emojiName("🎉")).not.toBe("Emoji");
  });
});
