import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({ env: () => ({ SESSION_SECRET: "x".repeat(40) }), features: { storage: () => false } }));
const { parseRange, resolveRange } = await import("../storage");

describe("HTTP-Range für Medien", () => {
  it("parst einzelne Bereiche", () => {
    expect(parseRange("bytes=0-1023")).toEqual({ start: 0, end: 1023 });
    expect(parseRange("bytes=500-")).toEqual({ start: 500 });
    expect(parseRange("bytes=-200")).toEqual({ suffix: 200 });
  });
  it("ignoriert ungültige und Mehrfachbereiche", () => {
    expect(parseRange(null)).toBeNull();
    expect(parseRange("bytes=-")).toBeNull();
    expect(parseRange("bytes=0-1,5-9")).toBeNull();
    expect(parseRange("items=0-1")).toBeNull();
  });
  it("löst Bereiche gegen die Grösse auf", () => {
    expect(resolveRange({ start: 0, end: 1023 }, 100)).toEqual({ start: 0, end: 99 });
    expect(resolveRange({ start: 10 }, 100)).toEqual({ start: 10, end: 99 });
    expect(resolveRange({ suffix: 30 }, 100)).toEqual({ start: 70, end: 99 });
    expect(resolveRange({ suffix: 500 }, 100)).toEqual({ start: 0, end: 99 });
    expect(resolveRange({ start: 100 }, 100)).toBeNull();
    expect(resolveRange({ start: 50, end: 10 }, 100)).toBeNull();
  });
});
