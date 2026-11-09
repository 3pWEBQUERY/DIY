import { describe, expect, it } from "vitest";
import { isInternalHref, parseInline, safeHref } from "../inline-marks";

describe("safeHref", () => {
  it("lässt interne Pfade, http(s) und mailto zu", () => {
    expect(safeHref("/anleitungen/regal")).toBe("/anleitungen/regal");
    expect(safeHref("/suche?q=holz#treffer")).toBe("/suche?q=holz#treffer");
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("mailto:hallo@example.com")).toBe("mailto:hallo@example.com");
  });

  it("lehnt Pfade ab, die der Browser auf einen fremden Ursprung auflöst", () => {
    expect(safeHref("//evil.com")).toBeNull();
    expect(safeHref("/\\evil.com")).toBeNull();
    expect(safeHref("/\\/evil.com")).toBeNull();
    expect(safeHref("/a\\b")).toBeNull();
    expect(safeHref("/\tevil.com")).toBeNull();
    expect(safeHref("/\u0000/evil.com")).toBeNull();
  });

  it("lehnt gefährliche Schemata ab", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("https:/\\evil.com")).toBeNull();
    expect(safeHref("evil.com")).toBeNull();
  });
});

describe("isInternalHref", () => {
  it("erkennt nur Pfade auf dem eigenen Ursprung", () => {
    expect(isInternalHref("/u/anna")).toBe(true);
    expect(isInternalHref("//evil.com")).toBe(false);
    expect(isInternalHref("/\\evil.com")).toBe(false);
    expect(isInternalHref("https://evil.com")).toBe(false);
  });
});

describe("parseInline – Links", () => {
  it("macht aus einem Backslash-Pfad keinen Link", () => {
    const nodes = parseInline("[klick](/\\evil.com)");
    expect(nodes.some((n) => n.t === "a")).toBe(false);
    expect(parseInline("[ok](/werkzeuge)")).toEqual([{ t: "a", href: "/werkzeuge", c: [{ t: "text", v: "ok" }] }]);
  });
});
