import { describe, expect, it } from "vitest";
import { HASHTAG_SOURCE, extractHashtags, hashtagHref, isHashtagToken, isValidHashtag, normalizeHashtag, tagToHashtag } from "@werkraum/shared";

const names = (...t: string[]) => extractHashtags(...t).map((h) => h.name);

describe("Hashtags erkennen", () => {
  it("findet Hashtags mit Umlauten, Ziffern und Unterstrich, ohne Doppelte", () => {
    expect(names("Neues Regal #DIY #Möbelbau #diy #holz_2026")).toEqual(["diy", "möbelbau", "holz_2026"]);
  });

  it("behält die erste Schreibweise für die Anzeige", () => {
    expect(extractHashtags("#DIY und #diy")[0]).toEqual({ name: "diy", display: "DIY" });
  });

  it("ignoriert Zahlen, Anker in Links, Wörter und HTML-Entitäten", () => {
    expect(names("Platz #1 am 2026#3")).toEqual([]);
    expect(names("https://werkuno.ch/hilfe#konto und seite#abschnitt")).toEqual([]);
    expect(names("&#38; /#top ?a=#b")).toEqual([]);
  });

  it("trennt an Satzzeichen", () => {
    expect(names("Fertig! #Eiche, #Leinen. (#Häkeln)")).toEqual(["eiche", "leinen", "häkeln"]);
  });

  it("verwirft zu lange Hashtags und begrenzt die Anzahl", () => {
    expect(names(`#${"a".repeat(51)}`)).toEqual([]);
    expect(extractHashtags(Array.from({ length: 40 }, (_, i) => `#tag${i}x`).join(" "))).toHaveLength(30);
  });

  it("normalisiert NFKC und klein", () => {
    expect(normalizeHashtag("#MöbelBau")).toBe("möbelbau");
    expect(hashtagHref("#Möbelbau")).toBe("/hashtag/m%C3%B6belbau");
  });

  it("macht aus Schlagwörtern Hashtags", () => {
    expect(tagToHashtag("Eiche massiv")).toEqual({ name: "eichemassiv", display: "Eichemassiv" });
    expect(tagToHashtag("2026")).toBeNull();
    expect(isValidHashtag("#diy")).toBe(true);
    expect(isHashtagToken("#123")).toBe(false);
  });

  it("lässt sich in split-Muster mit Erwähnungen einbauen", () => {
    const parts = "Mit @lena #DIY gebaut".split(new RegExp(`(@[a-z]+|${HASHTAG_SOURCE})`, "giu"));
    expect(parts.filter((_, i) => i % 2 === 1)).toEqual(["@lena", "#DIY"]);
  });
});
