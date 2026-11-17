import { describe, expect, it } from "vitest";
import { parseRichBlocks, richToPlain } from "@/lib/rich-text";

describe("Formatierter Text (Produktbeschreibung)", () => {
  it("bisheriger reiner Text bleibt ein Absatz mit Umbrüchen", () => {
    expect(parseRichBlocks("Zeile 1\nZeile 2")).toEqual([{ t: "p", text: "Zeile 1\nZeile 2" }]);
  });
  it("Absätze, Aufzählung und nummerierte Liste", () => {
    expect(parseRichBlocks("Einleitung\n\n- Eiche\n- Leinöl\n\n1. Sägen\n2. Schleifen\nSchluss")).toEqual([
      { t: "p", text: "Einleitung" },
      { t: "ul", items: ["Eiche", "Leinöl"] },
      { t: "ol", items: ["Sägen", "Schleifen"] },
      { t: "p", text: "Schluss" },
    ]);
  });
  it("Klartext ohne Auszeichnung für Meta-Beschreibungen", () => {
    expect(richToPlain("**Massiv** und *geölt* – [Pflege](https://werkuno.ch/hilfe)\n\n- Eiche")).toBe("Massiv und geölt – Pflege\n\n• Eiche");
  });
});
