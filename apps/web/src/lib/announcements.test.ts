import { describe, expect, it } from "vitest";
import { announcementColors, announcementSchema, announcementStatus, isAllowedAnnouncementHref, isAnnouncementLive, isSingleEmoji, type AnnouncementStyle } from "@werkraum/shared";
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

describe("Gestaltung", () => {
  it("nimmt Schrift, Grössen und Farben an und setzt Standards", () => {
    const a = announcementSchema.parse(base);
    expect(a).toMatchObject({ titleFont: "werkuno", bodyFont: "werkuno", titleSize: "m", bodySize: "m", textColor: "", bgMode: "tone", bgColor: "", bgMediaId: "", bgOverlay: 45, bgImageLight: "#FFFFFF", bgPosition: "center" });
    const b = announcementSchema.parse({ ...base, titleFont: "hand", bodyFont: "serif", titleSize: "xl", bodySize: "l", textColor: "#F2D58A", bgMode: "color", bgColor: "#123456" });
    expect(b).toMatchObject({ titleFont: "hand", titleSize: "xl", textColor: "#F2D58A", bgColor: "#123456" });
  });

  it("weist ungültige Werte ab", () => {
    for (const bad of [{ titleFont: "comic" }, { titleSize: "xxl" }, { textColor: "red" }, { textColor: "#12345" }, { bgColor: "url(x)" }, { bgOverlay: 95 }, { bgPosition: "left" }]) {
      expect(announcementSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("verlangt Farbe bzw. Bild zum gewählten Hintergrund", () => {
    expect(announcementSchema.safeParse({ ...base, bgMode: "color" }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, bgMode: "image" }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, bgMode: "image", bgMediaId: "cm123" }).success).toBe(true);
  });

  const style = (s: Partial<AnnouncementStyle>): AnnouncementStyle => ({ tone: "coral", bgMode: "tone", bgColor: "", bgImageUrl: null, bgOverlay: 45, textColor: "", ...s });

  it("wählt automatisch lesbare Schrift auf eigener Farbe", () => {
    expect(announcementColors(style({ bgMode: "color", bgColor: "#F2D58A" })).fg).toBe("#262427");
    expect(announcementColors(style({ bgMode: "color", bgColor: "#123456" })).fg).toBe("#FFFFFF");
    expect(announcementColors(style({ bgMode: "color", bgColor: "#123456" })).contrast).toBeGreaterThanOrEqual(4.5);
  });

  it("meldet zu wenig Kontrast bei eigener Schriftfarbe", () => {
    expect(announcementColors(style({ bgMode: "color", bgColor: "#FFFFFF", textColor: "#F2D58A" })).contrast).toBeLessThan(4.5);
    expect(announcementColors(style({ tone: "ink", textColor: "#FAF8F5" })).contrast).toBeGreaterThan(10);
  });

  it("rechnet auf Bildern mit der hellsten Stelle unter der Abdunkelung", () => {
    const weak = announcementColors(style({ bgMode: "image", bgImageUrl: "https://x/y.webp", bgOverlay: 10 }));
    const strong = announcementColors(style({ bgMode: "image", bgImageUrl: "https://x/y.webp", bgOverlay: 65 }));
    // Gemessenes, eher dunkles Bild braucht weniger Abdunkelung
    expect(announcementColors(style({ bgMode: "image", bgImageUrl: "https://x/y.webp", bgOverlay: 30, bgImageLight: "#8A7F74" })).contrast).toBeGreaterThanOrEqual(4.5);
    expect(announcementColors(style({ bgMode: "image", bgImageUrl: "https://x/y.webp", bgOverlay: 30 })).contrast).toBeLessThan(4.5);
    expect(weak.image).toBe(true);
    expect(weak.contrast).toBeLessThan(4.5);
    expect(strong.contrast).toBeGreaterThanOrEqual(4.5);
    // Ohne Bild-Adresse gilt die Palettenfarbe
    expect(announcementColors(style({ bgMode: "image" })).image).toBe(false);
  });
});
