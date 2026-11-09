import { describe, expect, it } from "vitest";
import { backoffDelay, isTransientStatus } from "../backoff";

describe("backoffDelay", () => {
  it("verdoppelt bis zur Obergrenze", () => {
    expect(backoffDelay(0)).toBe(2000);
    expect(backoffDelay(1)).toBe(4000);
    expect(backoffDelay(3)).toBe(16_000);
    expect(backoffDelay(4)).toBe(30_000);
    expect(backoffDelay(100)).toBe(30_000);
  });
  it("robust gegen ungültige Versuchszahlen", () => {
    expect(backoffDelay(-1)).toBe(2000);
    expect(backoffDelay(Number.NaN)).toBe(2000);
    expect(backoffDelay(2, { base: 500, max: 1000 })).toBe(1000);
  });
});

describe("isTransientStatus", () => {
  it("Netzfehler, 408, 429 und 5xx → erneut versuchen", () => {
    for (const s of [null, undefined, 0, 408, 429, 500, 502, 503]) expect(isTransientStatus(s)).toBe(true);
  });
  it("übrige 4xx → aufgeben", () => {
    for (const s of [400, 401, 403, 404, 410]) expect(isTransientStatus(s)).toBe(false);
  });
});
